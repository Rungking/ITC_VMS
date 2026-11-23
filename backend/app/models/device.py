from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.enums import DeviceKind, Vendor
from app.models._types import created_at_column, str_enum


class Zone(Base):
    """โซน/สถานที่ เช่น 'ตลาดสด' ใช้จัดกลุ่มกล้องและกำหนดสิทธิ์"""

    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(String(255), default="")


class Device(Base):
    """NVR หรือกล้องเดี่ยวที่ระบบเชื่อมต่อโดยตรง"""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    vendor: Mapped[Vendor] = mapped_column(str_enum(Vendor))
    kind: Mapped[DeviceKind] = mapped_column(str_enum(DeviceKind))
    host: Mapped[str] = mapped_column(String(255))
    http_port: Mapped[int] = mapped_column(default=80)
    rtsp_port: Mapped[int] = mapped_column(default=554)
    use_https: Mapped[bool] = mapped_column(default=False)
    username: Mapped[str] = mapped_column(String(64))
    password_encrypted: Mapped[str] = mapped_column(String(512))  # Fernet, see app.core.crypto

    model: Mapped[str] = mapped_column(String(128), default="")
    serial: Mapped[str] = mapped_column(String(128), default="")
    firmware: Mapped[str] = mapped_column(String(128), default="")

    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    is_online: Mapped[bool] = mapped_column(default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()

    cameras: Mapped[list["Camera"]] = relationship(back_populates="device", cascade="all, delete-orphan")


class Camera(Base):
    """กล้อง 1 ตัว = 1 channel ของอุปกรณ์ (กล้องเดี่ยวมี channel 1)"""

    __tablename__ = "cameras"
    __table_args__ = (UniqueConstraint("device_id", "channel"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    channel: Mapped[int]  # 1-based
    name: Mapped[str] = mapped_column(String(128))
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    enabled: Mapped[bool] = mapped_column(default=True)
    has_ai: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = created_at_column()

    device: Mapped[Device] = relationship(back_populates="cameras")
