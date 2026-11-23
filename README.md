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
.\.venv\Scripts\python.exe -m app.cli probe --host 192.168.1.108 --user admin --snapshot ch1.jpg --events 30
```
คำสั่งนี้แสดงรุ่น, รายการกล้อง, RTSP URL, บันทึกภาพนิ่ง และแสดงเหตุการณ์ (motion/AI) ที่เกิดขึ้นใน 30 วินาที

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
