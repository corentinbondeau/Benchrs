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
import tempfile
from typing import Any

import httpx
from supabase import create_client

import config as cfg


class SupabaseGateway:
    """Point d'accès unique du worker vers Supabase."""

    def __init__(self) -> None:
        cfg.check_config(require_supabase=True)
        self.sb = create_client(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY)
        self.table = "video_analyses"

    # ─── File d'attente ────────────────────────────────────────
    def claim_next_pending(self) -> dict | None:
        """Prend la plus ancienne tâche 'pending' et la passe en
        'processing' (avec horodatage de démarrage). Retourne la
        tâche ou None si la file est vide."""
        res = (
            self.sb.table(self.table)
            .select("*")
            .eq("status", "pending")
            .order("created_at")
            .limit(1)
            .execute()
        )
        data = (res.data or []) if res.data else []
        if not data:
            return None

        job = data[0]
        self.sb.table(self.table).update(
            {"status": "processing", "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "progress": 1}
        ).eq("id", job["id"]).execute()
        return job

    def update_progress(self, job_id: str, pct: int) -> None:
        self.sb.table(self.table).update({"progress": max(0, min(100, int(pct)))}).eq(
            "id", job_id
        ).execute()

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
                "error": error[:2000],
                "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()

    # ─── Storage ───────────────────────────────────────────────
    def download_video(self, storage_path: str) -> str:
        """Télécharge la vidéo dans un fichier temporaire local.

        Les vidéos de match peuvent atteindre ~1 Go : on passe par
        une URL signée (1 h) et un téléchargement streamé afin de ne
        jamais charger tout le fichier en mémoire.
        """
        res = self.sb.storage.from_(cfg.VIDEO_BUCKET).create_signed_url(storage_path, 3600)
        if not res or not res.get("signedURL"):
            raise RuntimeError(f"Impossible de générer une URL signée : {storage_path}")

        tmp = tempfile.NamedTemporaryFile(
            suffix=os.path.splitext(storage_path)[1] or ".mp4", delete=False
        )
        tmp_path = tmp.name
        tmp.close()

        try:
            with httpx.stream(
                "GET", res["signedURL"], timeout=cfg.DOWNLOAD_TIMEOUT_SEC, follow_redirects=True
            ) as r:
                r.raise_for_status()
                with open(tmp_path, "wb") as f:
                    for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
        except Exception:
            os.unlink(tmp_path) if os.path.exists(tmp_path) else None
            raise

        return tmp_path

    @staticmethod
    def cleanup(path: str) -> None:
        if path and os.path.exists(path):
            os.unlink(path)