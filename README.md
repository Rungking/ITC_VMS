# ITC VMS

ระบบบริหารจัดการวิดีโอ (Video Management System) สำหรับกล้องวงจรปิดและ NVR หลายยี่ห้อ
ดูภาพสด แผนที่ Topology ของเครือข่าย บันทึก ย้อนหลัง และแจ้งเตือน

สถานะ: **Phase 0** รวมต้นแบบ Next.js เข้ากับ backend Python จากโครงการ CCTV และถอด ZoneMinder ออก

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): การออกแบบระบบ และเหตุผลที่เลิกใช้ ZoneMinder
- [docs/ROADMAP.md](docs/ROADMAP.md): แผนการพัฒนา
- [docs/tasks/](docs/tasks/README.md): ติดตามงาน 2 สาย ([Backend](docs/tasks/BACKEND.md) · [Web](docs/tasks/WEB.md))

## โครงสร้าง

```
web/       Next.js (ต้นแบบของทีม)          ← สาย Web
backend/   Python 3.12 / FastAPI / ไดรเวอร์ Dahua + NetSDK   ← สาย Backend
deploy/    docker-compose.yml, mediamtx.yml, .env.example
docs/      การออกแบบ, roadmap, งาน; docs/cctv/ = เอกสารเดิมของ CCTV
tools/     MediaMTX สำหรับพัฒนาบน Windows (ไม่เก็บใน git)
```

## พัฒนาบนเครื่อง (Windows)

### Backend
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m pytest
```

รันด้วย SQLite (ไม่ต้องติดตั้ง PostgreSQL):
```powershell
$env:CCTV_DATABASE_URL = "sqlite+aiosqlite:///./dev.db"
$env:CCTV_FIRST_ADMIN_USERNAME = "admin"
$env:CCTV_FIRST_ADMIN_PASSWORD = "<ตั้งรหัสผ่าน>"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```
เอกสาร API: http://localhost:8000/api/docs (prefix `CCTV_` จะเปลี่ยนเป็น `VMS_` ในงาน B-02)

**Dahua NetSDK** (จำเป็นสำหรับ NVR firmware เก่าที่ RTSP ใช้ไม่ได้): ดู [backend/vendor/README.md](backend/vendor/README.md)

ทดสอบกับ NVR จริง:
```powershell
.\.venv\Scripts\python.exe -m app.cli probe --host 192.168.1.110 --user itc --channel 2 --publish rtsp://127.0.0.1:8554/cam2
```

### ภาพสดในเบราว์เซอร์
1. แตก [MediaMTX v1.9.3 (windows_amd64)](https://github.com/bluenviron/mediamtx/releases/tag/v1.9.3) ไว้ที่ `tools\mediamtx\`
2. `tools\mediamtx\mediamtx.exe deploy\mediamtx.dev.yml`
3. ส่งภาพเข้าด้วยคำสั่ง `probe --publish` ข้างบน แล้วเปิด http://127.0.0.1:8889/cam2

### Web (ต้องมี Node.js 22)
```powershell
cd web
npm install
npm run dev
```
เปิด http://localhost:3000 (ตอนนี้ยังเรียก ZoneMinder ผ่าน `/api/zm` และ Prisma จนกว่าจะเสร็จงาน W-03)

## ติดตั้งบนเซิร์ฟเวอร์ (Docker)
```bash
cd deploy
cp .env.example .env        # กรอกรหัสผ่านและ key
docker compose up -d --build
```
ยังใช้ไม่ได้จนกว่าจะเสร็จ W-02 (Dockerfile ของ web) และ B-07
