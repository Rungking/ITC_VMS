# CCTV Management Platform

ระบบบริหารจัดการกล้องวงจรปิดและเครื่องบันทึกภาพ (NVR) หลายยี่ห้อ สำหรับหน่วยงานท้องถิ่น
เริ่มจาก Dahua แล้วต่อด้วย Hikvision, Uniview และ ONVIF

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): การออกแบบระบบ
- [docs/ROADMAP.md](docs/ROADMAP.md): แผนการพัฒนา

สถานะ: **Phase 0** (วางรากฐาน)

## โครงสร้างโปรเจค

```
backend/                 Python 3.12+ / FastAPI
  app/core/              config, db, security (JWT + Argon2), crypto (Fernet), enums
  app/models/            User, Zone, Device, Camera, AuditLog
  app/api/               /api/auth, /api/users  (+ deps: ตรวจ token, RBAC)
  app/drivers/           DeviceDriver interface + NormalizedEvent
    dahua/               Dahua HTTP API: device info, channels, RTSP, snapshot, event stream
  app/services/          audit log, bootstrap admin
  app/cli.py             gen-keys / create-admin / probe (ทดสอบอุปกรณ์จริง)
  alembic/               database migrations
  tests/
frontend/                React + TypeScript + Ant Design (ภาษาไทย)
deploy/                  docker-compose.yml, mediamtx.yml, .env.example
docs/
```

## พัฒนาบนเครื่อง (Windows)

### Backend
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m pytest
```

รันเซิร์ฟเวอร์ด้วย SQLite (ไม่ต้องติดตั้ง PostgreSQL):
```powershell
$env:CCTV_DATABASE_URL = "sqlite+aiosqlite:///./dev.db"
$env:CCTV_FIRST_ADMIN_USERNAME = "admin"
$env:CCTV_FIRST_ADMIN_PASSWORD = "<ตั้งรหัสผ่าน>"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```
เอกสาร API: http://localhost:8000/api/docs

### ทดสอบกับกล้อง/NVR Dahua จริง
```powershell
.\.venv\Scripts\python.exe -m app.cli probe --host 192.168.1.108 --user admin --snapshot ch.jpg --record 10 --out ch.mp4 --events 30
```
คำสั่งนี้แสดงรุ่นและรายการกล้อง จากนั้นเลือกช่องทางดึงภาพให้อัตโนมัติ (ใช้ RTSP ถ้าใช้ได้ ถ้าไม่ได้จะใช้ NetSDK แทน)
แล้วบันทึกภาพนิ่ง บันทึกวิดีโอ 10 วินาที และแสดงเหตุการณ์ที่เกิดขึ้นใน 30 วินาที
บังคับช่องทางได้ด้วย `--media rtsp` หรือ `--media netsdk` (ต้องติดตั้ง ffmpeg)

**Dahua NetSDK** (จำเป็นสำหรับ NVR/กล้อง firmware เก่าที่ RTSP ใช้ไม่ได้): ดูวิธีติดตั้งที่ [backend/vendor/README.md](backend/vendor/README.md)

### ดูภาพสดในเบราว์เซอร์ (ทดสอบบนเครื่อง)
1. ดาวน์โหลด [MediaMTX v1.9.3 (windows_amd64)](https://github.com/bluenviron/mediamtx/releases/tag/v1.9.3) แล้วแตกไฟล์ไว้ที่ `tools\mediamtx\` (โฟลเดอร์นี้ไม่เก็บใน git)
2. เปิด MediaMTX:
   ```powershell
   tools\mediamtx\mediamtx.exe deploy\mediamtx.dev.yml
   ```
3. ส่งภาพจากกล้องเข้า MediaMTX (ในโฟลเดอร์ `backend`):
   ```powershell
   .\.venv\Scripts\python.exe -m app.cli probe --host 192.168.1.110 --user itc --channel 2 --publish rtsp://127.0.0.1:8554/cam2
   ```
4. เปิด http://127.0.0.1:8889/cam2 ในเบราว์เซอร์

### Frontend (ต้องมี Node.js 22)
```powershell
cd frontend
npm install
npm run dev
```
เปิด http://localhost:5173 (ระบบส่ง `/api` ต่อไปที่ backend พอร์ต 8000)

## ติดตั้งบนเซิร์ฟเวอร์ (Docker)
```bash
cd deploy
cp .env.example .env        # กรอกรหัสผ่านและ key
docker compose up -d --build
```
