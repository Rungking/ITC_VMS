"""Encryption for secrets stored in the database (device passwords)."""

from cryptography.fernet import Fernet

from app.core.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().credentials_key
    if not key:
        raise RuntimeError("VMS_CREDENTIALS_KEY is not set (generate one with: python -m app.cli gen-keys)")
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
