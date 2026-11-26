from app.core.enums import Vendor
from app.drivers.base import ConnectionParams, DeviceDriver, NotSupportedError
from app.drivers.dahua import DahuaDriver
from app.drivers.hikvision import HikvisionDriver

_DRIVERS: dict[Vendor, type[DeviceDriver]] = {
    Vendor.DAHUA: DahuaDriver,
    Vendor.HIKVISION: HikvisionDriver,
    # Phase 5: Vendor.ONVIF, Vendor.UNIVIEW
}


def supported_vendors() -> list[Vendor]:
    return list(_DRIVERS)


def create_driver(vendor: Vendor, params: ConnectionParams, **options) -> DeviceDriver:
    """`options` are vendor-specific, e.g. media="netsdk" for Dahua."""
    try:
        driver_cls = _DRIVERS[vendor]
    except KeyError:
        raise NotSupportedError(f"No driver for vendor {vendor!r} yet") from None
    return driver_cls(params, **options)
