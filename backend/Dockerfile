FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install . "uvicorn[standard]"

COPY alembic.ini ./
COPY alembic ./alembic

RUN useradd --system --uid 1000 cctv
USER cctv

EXPOSE 8000
# Apply DB migrations, then serve. --proxy-headers: real client IP from nginx for the audit log.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
