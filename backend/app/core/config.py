from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "change-me"


class Settings(BaseSettings):
    """All settings come from environment variables prefixed with CCTV_ (or a .env file)."""

    model_config = SettingsConfigDict(env_prefix="CCTV_", env_file=".env", extra="ignore")

    environment: str = "development"  # development | production
    app_name: str = "CCTV Platform"

    database_url: str = "postgresql+asyncpg://cctv:cctv@localhost:5432/cctv"
    redis_url: str = "redis://localhost:6379/0"
    mediamtx_api_url: str = "http://localhost:9997"

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
