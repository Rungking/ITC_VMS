from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"  # ผู้ดูแลระบบ: เพิ่มอุปกรณ์ จัดการผู้ใช้
    SUPERVISOR = "supervisor"  # หัวหน้า: ดูย้อนหลัง ส่งออกคลิป
    OPERATOR = "operator"  # เจ้าหน้าที่: ดูภาพสด รับแจ้งเตือน
    VIEWER = "viewer"  # ดูอย่างเดียว


ROLE_LEVEL: dict[Role, int] = {Role.VIEWER: 0, Role.OPERATOR: 1, Role.SUPERVISOR: 2, Role.ADMIN: 3}


class Vendor(StrEnum):
    DAHUA = "dahua"
    HIKVISION = "hikvision"
    UNIVIEW = "uniview"
    ONVIF = "onvif"


class DeviceKind(StrEnum):
    NVR = "nvr"
    CAMERA = "camera"
