FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# ffmpeg: re-muxes vendor SDK video into RTSP for MediaMTX, grabs snapshot frames.
# libx11/libxv/libgl/libasound: required by Dahua NetSDK's bundled libplay/libRenderEngine (no display needed).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libx11-6 libxv1 libgl1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
RUN pip install . "uvicorn[standard]"

# Licensed vendor SDK wheels (not in git): put e.g. NetSDK-*-linux_x86_64.whl in backend/vendor/ before building.
COPY vendor/ ./vendor/
RUN if ls vendor/*.whl >/dev/null 2>&1; then pip install vendor/*.whl; fi

COPY alembic.ini ./
COPY alembic ./alembic

RUN useradd --system --uid 1000 cctv
USER cctv

EXPOSE 8000
# Apply DB migrations, then serve. --proxy-headers: real client IP from nginx for the audit log.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
