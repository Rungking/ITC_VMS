# Vendor SDKs

Licensed vendor libraries that are not on PyPI and must not be committed. Copy the wheel here before
building the Docker image; it is installed automatically if present.

| SDK | File | Source |
|---|---|---|
| Dahua NetSDK (Python) | `NetSDK-2.0.0.1-py3-none-linux_x86_64.whl` | `Z_ExternalFile/General_NetSDK_Eng_Python_linux64_IS_V3.060.0000003.0.R.251201/.../dist/` |

For local development on Windows, install the `win_amd64` wheel into the venv instead:

```powershell
.\.venv\Scripts\python.exe -m pip install "<path>\NetSDK-2.0.0.1-py3-none-win_amd64.whl"
```

Without NetSDK the system still works with devices whose RTSP works; only old Dahua firmware needs it.
