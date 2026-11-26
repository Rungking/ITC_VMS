from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "change-me"


class Settings(BaseSettings):
    """All settings come from environment variables prefixed with VMS_ (or a .env file)."""

    model_config = SettingsConfigDict(env_prefix="VMS_", env_file=".env", extra="ignore")

    environment: str = "development"  # development | production
    app_name: str = "ITC VMS"

    database_url: str = "postgresql+asyncpg://vms:vms@localhost:5432/vms"
    redis_url: str = "redis://localhost:6379/0"
    mediamtx_api_url: str = "http://localhost:9997"
    # Address the *browser* uses for WebRTC (WHEP) - behind the reverse proxy in production (B-07).
    mediamtx_webrtc_url: str = "http://127.0.0.1:8889"

    # Development only: camera list/live/playback without login, until the web has real login (B-03/W-05).
    # Refused at startup when environment=production.
    dev_no_auth: bool = False

    secret_key: str = DEFAULT_SECRET  # signs JWT access tokens
    access_token_minutes: int = 480  # one work shift
    credentials_key: str = ""  # Fernet key that encrypts device passwords

    first_admin_username: str | None = None
    first_admin_password: str | None = None

    cors_origins: list[str] = []

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
