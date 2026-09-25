# ============================================================
# run_local.py — Test / débug hors Supabase.
#
# Analyse une vidéo locale et écrit le rapport JSON sur disque,
# sans base de données. Idéal pour valider la pipeline sur un
# clip de 30 secondes avant de brancher le worker.
#
# Usage :   python run_local.py chemin/vers/match.mp4 [out.json]
# Exemple : python run_local.py ~/Videos/clip30s.mp4
# ============================================================
from __future__ import annotations

import json
import sys
import time

import config as cfg


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage : python run_local.py <video.mp4> [out.json]")
        sys.exit(1)

    video_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "analysis_result.json"

    cfg.check_config(require_supabase=False)

    from match_analyzer import analyze_video

    start = time.time()
    started = time.time()

    def progress(pct: int) -> None:
        elapsed = time.time() - started
        print(f"\rAnalyse… {pct:3d}%  ({elapsed:.1f}s)", end="", flush=True)

    print(f"Analyse de {video_path} (modèle {cfg.MODEL_NAME})…")
    result = analyze_video(video_path, progress_cb=progress)
    print(f"\nTerminé en {time.time() - start:.1f}s")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # Petit aperçu console
    print("\n  Possession : Équipe 1 = %.1f%% | Équipe 2 = %.1f%%"
          % (result["stats"]["possession"]["team1"], result["stats"]["possession"]["team2"]))
    print("  Passes     : %s vs %s" % (result["stats"]["passes"]["team1"], result["stats"]["passes"]["team2"]))
    print("  Tirs       : %s (dont %s cadrés) vs %s (dont %s cadrés)"
          % (result["stats"]["shots"]["team1"], result["stats"]["shots_on_target"]["team1"],
             result["stats"]["shots"]["team2"], result["stats"]["shots_on_target"]["team2"]))
    print(f"  Timeline   : {len(result['timeline'])} événement(s)")
    print(f"\nRapport écrit dans {out_path}")


if __name__ == "__main__":
    main()