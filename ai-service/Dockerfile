# ============================================================
# Benchrs — Worker d'analyse vidéo IA
# Build depuis le contexte `ai-service` (dockerContext: ai-service).
# ============================================================
FROM python:3.11-slim

# OpenCV a besoin de libGL / libglib2.0 au runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Dépendances (torch CPU-wheel, ultralytics, supervision…)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Poids YOLO pré-téléchargés au build (évite le download à chaud
# au premier job, ~50 Mo).
RUN python -c "from ultralytics import YOLO; YOLO('yolov8m.pt')"

COPY . .

ENV DEVICE=auto \
    PYTHONUNBUFFERED=1

CMD ["python", "worker.py"]