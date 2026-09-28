# ============================================================
# supabase_gateway.py — Liaison entre le worker Python et
# Supabase (file d'attente + storage + remontée des résultats).
#
# Le worker tourne avec le SERVICE_ROLE : il peut donc écrire le
# statut/progress/result des tâches sans les contraintes RLS du
# front (la table video_analyses est publique en lectur pour les
# membres, mais seules les écritures du worker modifient le job).
# ============================================================
from __future__ import annotations

import datetime as dt
import json
import os
import re
import tempfile
from urllib.parse import urlparse

import httpx
from supabase import create_client

import config as cfg


class SupabaseGateway:
    """Point d'accès unique du worker vers Supabase."""

    def __init__(self) -> None:
        cfg.check_config(require_supabase=True)
        self.sb = create_client(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY)
        self.table = "video_analyses"
        self._last_pct = -1

    # ─── File d'attente ────────────────────────────────────────
    def claim_next_pending(self) -> dict | None:
        """Réclame ATOMIQUEMENT le plus ancien job éligible.

        RPC SECURITY DEFINER (migration 107) : une seule ligne passe
        en 'processing' dans la même instruction (SELECT FOR UPDATE
        SKIP LOCKED) → pas de double traitement entre workers. Les
        jobs 'processing' dont le heartbeat a expiré (started_at trop
        ancien) sont re-réclamés (résilience aux crashs).
        """
        res = self.sb.rpc("claim_next_video_job", {"p_timeout_min": 15}).execute()
        rows = (res.data or []) if res.data else []
        if rows:
            self._last_pct = -1  # job neuf : réarme le throttle
        return rows[0] if rows else None

    def update_progress(self, job_id: str, pct: int) -> None:
        """Progression écrit en base UNIQUEMENT quand on franchit un
        palier de PROGRESS_STEP % (anti-amplification d'écriture)."""
        p = max(0, min(100, int(pct)))
        bucket = (p // cfg.PROGRESS_STEP) * cfg.PROGRESS_STEP
        if bucket <= self._last_pct:
            return
        self._last_pct = bucket
        self.sb.table(self.table).update(
            {"progress": bucket, "started_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        ).eq("id", job_id).execute()

    def touch_job(self, job_id: str) -> None:
        """Heartbeat : prolonge started_at pour ne pas être re-réclamé
        par le cron (poussée en base légère, throttlée par l'appelant)."""
        self.sb.table(self.table).update(
            {"started_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        ).eq("id", job_id).execute()

    def mark_completed(self, job_id: str, result: dict) -> None:
        self.sb.table(self.table).update(
            {
                "status": "completed",
                "progress": 100,
                "result": json.dumps(result),  # JSONB : supabase-py accepte une str JSON
                "error": None,
                "model_version": cfg.MODEL_NAME,
                "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()

    def mark_failed(self, job_id: str, error: str) -> None:
        self.sb.table(self.table).update(
            {
                "status": "failed",
                "error": self._sanitize_error(error),
                "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()

    @staticmethod
    def _sanitize_error(error: str) -> str:
        """Nettoie le message avant stockage : pas de chemins locaux
        (/tmp/…) ni de storage_path dans l'erreur exposée au front."""
        msg = str(error)
        msg = re.sub(r"/[a-zA-Z0-9_]*(?:/[a-zA-Z0-9._-]+)+\.[a-zA-Z0-9]+", "[fichier local]", msg)
        msg = re.sub(r"(?i)(storage_path|storage)/([^ ,;:)]+)", "[chemin de stockage]", msg)
        return (msg or "erreur inconnue")[:2000]

    # ─── Storage ───────────────────────────────────────────────
    def download_video(self, storage_path: str) -> str:
        """Télécharge la vidéo dans un fichier temporaire local.

        Les vidéos de match peuvent atteindre ~1 Go : on passe par
        une URL signée (1 h) et un téléchargement streamé afin de ne
        jamais charger tout le fichier en mémoire. L'hôte de l'URL
        signée est validé (anti-redirect vers un hôte tiers) et les
        redirections sont revalidées à la volée.
        """
        res = self.sb.storage.from_(cfg.VIDEO_BUCKET).create_signed_url(storage_path, 3600)
        if not res or not res.get("signedURL"):
            raise RuntimeError("Impossible de générer une URL signée pour la vidéo")

        signed_url = res["signedURL"]
        self._assert_supabase_host(signed_url)

        tmp = tempfile.NamedTemporaryFile(
            suffix=os.path.splitext(storage_path)[1] or ".mp4", delete=False
        )
        tmp_path = tmp.name
        tmp.close()

        try:
            with httpx.stream(
                "GET", signed_url, timeout=cfg.DOWNLOAD_TIMEOUT_SEC, follow_redirects=True
            ) as r:
                # Après chaque redirection, on revalide l'hôte (défense
                # contre une URL signée "polymorphe" redirigeant ailleurs).
                if not self._is_supabase_host(r.url.host):
                    raise RuntimeError("Redirection vers un hôte non Supabase refusée")
                r.raise_for_status()
                with open(tmp_path, "wb") as f:
                    for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
        except Exception:
            os.unlink(tmp_path) if os.path.exists(tmp_path) else None
            raise

        return tmp_path

    @staticmethod
    def _is_supabase_host(host: str | None) -> bool:
        if not host:
            return False
        # L'URL signée doit appartenir au projet SUPABASE_URL (même hôte).
        try:
            expected = urlparse(cfg.SUPABASE_URL).hostname or ""
        except Exception:
            expected = ""
        return bool(expected) and host.lower() == expected.lower() and expected.endswith(".supabase.co")

    @staticmethod
    def _assert_supabase_host(url: str) -> None:
        parsed = urlparse(url)
        if not SupabaseGateway._is_supabase_host(parsed.hostname):
            raise RuntimeError("URL signée hors du projet Supabase refusée")

    @staticmethod
    def cleanup(path: str) -> None:
        if path and os.path.exists(path):
            os.unlink(path)