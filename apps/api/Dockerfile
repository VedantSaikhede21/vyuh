# syntax=docker/dockerfile:1
# VYUH API image. Build from the repo root (it needs the terrain presets):
#   docker build -f apps/api/Dockerfile -t vyuh-api .
# Dockerfile.dockerignore (next to this file) limits the context to apps/api and
# each preset's meta.json, heightmap.u16 and buildings.geojson (decision 73).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1

COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api/ ./
COPY apps/web/public/terrain/ /app/terrain/

ENV PATH=/app/.venv/bin:$PATH \
    TERRAIN_DIR=/app/terrain

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed.demo && uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000"]
