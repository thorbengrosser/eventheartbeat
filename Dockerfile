# Multi-stage build: build React frontend, then serve via Flask with gunicorn+eventlet

## Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

## Stage 2: Backend runtime
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Copy backend
COPY backend/ ./backend/

# Install Python deps
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r backend/requirements.txt \
 && pip install --no-cache-dir gunicorn==21.2.0

# Copy frontend build into Flask static dir
RUN mkdir -p backend/static
COPY --from=frontend-builder /app/frontend/build/ ./backend/static/

# Environment
ENV PORT=5001 \
    WEB_CONCURRENCY=1

EXPOSE 5001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1

# Run with eventlet worker to support WebSockets
CMD ["gunicorn", "--worker-class", "eventlet", "-w", "1", "-b", "0.0.0.0:5001", "backend.app:app"]


