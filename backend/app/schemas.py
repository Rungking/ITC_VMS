from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import DeviceKind, Role, Vendor

USERNAME_PATTERN = r"^[a-zA-Z0-9_.-]{3,64}$"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: Role
    is_active: bool


class UserCreate(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=128)
    role: Role = Role.VIEWER


class UserUpdate(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=128)
    role: Role | None = None
    is_active: bool | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- devices & cameras ----------------------------------------------------
class DeviceCreate(BaseModel):
    name: str = Field(default="", max_length=128)
    vendor: Vendor
    host: str = Field(min_length=1, max_length=255)
    http_port: int = Field(default=80, ge=1, le=65535)
    rtsp_port: int = Field(default=554, ge=1, le=65535)
    use_https: bool = False
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class DeviceOut(BaseModel):
    """Never includes the device password."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    vendor: Vendor
    kind: DeviceKind
    host: str
    http_port: int
    rtsp_port: int
    model: str
    serial: str
    firmware: str
    is_online: bool
    last_seen_at: datetime | None


class CameraDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    vendor: Vendor
    kind: DeviceKind
    host: str
    model: str
    is_online: bool


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    channel: int
    name: str
    enabled: bool
    has_ai: bool
    remote_address: str  # IP of the physical camera
    lat: float | None
    lng: float | None
    location_name: str
    device: CameraDeviceOut


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    location_name: str | None = Field(default=None, max_length=255)
    enabled: bool | None = None


class StreamOut(BaseModel):
    path: str
    whep_url: str  # the browser POSTs its WebRTC offer here


StreamKind = Literal["main", "sub"]


class PlaybackRequest(BaseModel):
    """Times in the NVR's local clock (what the user sees on the NVR), e.g. 2026-11-26T09:00:00."""

    start: datetime
    end: datetime

    @model_validator(mode="after")
    def _check_range(self):
        if self.end <= self.start:
            raise ValueError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม")
        if self.end - self.start > timedelta(hours=24):
            raise ValueError("ดูย้อนหลังได้ครั้งละไม่เกิน 24 ชั่วโมง")
        return self
