from enum import StrEnum

from sqlalchemy import DateTime, Enum, func
from sqlalchemy.orm import mapped_column


def str_enum(enum_cls: type[StrEnum]) -> Enum:
    """Store the enum's value (e.g. 'admin') as VARCHAR, not a native DB enum: easier migrations."""
    return Enum(
        enum_cls,
        native_enum=False,
        length=16,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )


def created_at_column():
    return mapped_column(DateTime(timezone=True), server_default=func.now())
