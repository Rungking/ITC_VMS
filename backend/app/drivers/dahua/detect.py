"""Pick the media path for a Dahua device: standard RTSP when it works, NetSDK otherwise."""

import logging

from app.drivers.base import ConnectionParams, StreamType
from app.drivers.dahua.driver import DahuaDriver, DahuaMedia
from app.media.rtsp_probe import RtspProbeResult, probe_rtsp

log = logging.getLogger(__name__)


async def detect_media(params: ConnectionParams, channel: int) -> tuple[DahuaMedia, RtspProbeResult]:
    """Try RTSP DESCRIBE on one channel that has a camera. Fall back to NetSDK if it fails and the SDK is installed."""
    async with DahuaDriver(params) as drv:
        url = drv.authenticated_url(await drv.get_stream_url(channel, StreamType.SUB))
    result = await probe_rtsp(url)
    if result.ok:
        return DahuaMedia.RTSP, result

    from app.drivers.dahua import netsdk

    if netsdk.AVAILABLE:
        log.info("%s: RTSP %s - using NetSDK", params.host, result.status)
        return DahuaMedia.NETSDK, result
    log.warning("%s: RTSP %s and NetSDK is not installed - live view will not work", params.host, result.status)
    return DahuaMedia.RTSP, result
