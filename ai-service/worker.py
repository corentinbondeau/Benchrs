# ============================================================
# worker.py — Démon de traitement de la file d'attente.
#
# Boucle infinie :
#   1. réclame la plus ancienne tâche 'pending',
#   2. télécharge la vidéo (URL signée),
#   3. analyse (YOLO + OpenCV) en remontant la progression,
#   4. écrit le résultat JSON dans la table video_analyses.
#
# Lancement :
#   python worker.py
# Point d'entrée à partir duquel la vidéo de job["storage_path"]
# est traitée. Chaque itération lève les erreurs vers mark_failed.
# ============================================================
from __future__ import annotations

import logging
import time
import traceback

import config as cfg
from match_analyzer import analyze_video
from supabase_gateway import SupabaseGateway

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("benchrs-worker")


def process_job(gateway: SupabaseGateway, job: dict) -> None:
    job_id = job["id"]
    storage_path = job["storage_path"]
    video_path = ""

    log.info("Démarrage analyse %s (vidéo %s)", job_id, storage_path)
    gateway.update_progress(job_id, 2)

    def progress(pct: int) -> None:
        gateway.update_progress(job_id, pct)

    try:
        video_path = gateway.download_video(storage_path)
        log.info("Vidéo téléchargée : %s", video_path)

        result = analyze_video(video_path, progress_cb=progress)
        gateway.mark_completed(job_id, result)
        log.info("Analyse %s terminée", job_id)
    finally:
        gateway.cleanup(video_path)


def run_forever() -> None:
    cfg.check_config(require_supabase=True)
    gateway = SupabaseGateway()
    log.info(
        "Worker Benchrs actif — modèle %s — polling toutes les %ss",
        cfg.MODEL_NAME,
        cfg.POLL_INTERVAL_SEC,
    )

    while True:
        try:
            job = gateway.claim_next_pending()
            if job is None:
                time.sleep(cfg.POLL_INTERVAL_SEC)
                continue
            try:
                process_job(gateway, job)
            except Exception as exc:  # noqa: BLE001 — le worker doit survivre
                log.error("Échec tâche %s : %s", job.get("id"), exc)
                traceback.print_exc()
                gateway.mark_failed(job["id"], str(exc))
        except Exception as exc:  # noqa: BLE001
            log.error("Erreur boucle worker : %s", exc)
            time.sleep(cfg.POLL_INTERVAL_SEC)


if __name__ == "__main__":
    run_forever()