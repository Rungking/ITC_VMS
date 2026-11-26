# ITC VMS

ระบบบริหารจัดการวิดีโอ (Video Management System) สำหรับกล้องวงจรปิดและ NVR หลายยี่ห้อ
ดูภาพสด แผนที่ Topology ของเครือข่าย บันทึก ย้อนหลัง และแจ้งเตือน

สถานะ: **Phase 0** รวมต้นแบบ Next.js เข้ากับ backend Python จากโครงการ CCTV และถอด ZoneMinder ออก

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): การออกแบบระบบ และเหตุผลที่เลิกใช้ ZoneMinder
- [docs/ROADMAP.md](docs/ROADMAP.md): แผนการพัฒนา
- [docs/LAB_DEVICES.md](docs/LAB_DEVICES.md): อุปกรณ์ในแล็บ (Dahua/Hikvision 6 ชิ้น) และ API ที่ใช้ดึงข้อมูล
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
$env:VMS_DATABASE_URL = "sqlite+aiosqlite:///./dev.db"
$env:VMS_FIRST_ADMIN_USERNAME = "admin"
$env:VMS_FIRST_ADMIN_PASSWORD = "<ตั้งรหัสผ่าน>"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```
เอกสาร API: http://localhost:8000/api/docs

**Dahua NetSDK** (จำเป็นสำหรับ NVR firmware เก่าที่ RTSP ใช้ไม่ได้): ดู [backend/vendor/README.md](backend/vendor/README.md)

ทดสอบกับ NVR จริง:
```powershell
.\.venv\Scripts\python.exe -m app.cli probe --host 192.168.1.110 --user itc --channel 2 --publish rtsp://127.0.0.1:8554/cam2
```

### ภาพสดและย้อนหลังบนเครื่องพัฒนา (3 โปรแกรม)
1. **MediaMTX:** แตก [MediaMTX v1.9.3 (windows_amd64)](https://github.com/bluenviron/mediamtx/releases/tag/v1.9.3) ไว้ที่ `tools\mediamtx\` แล้วรัน
   `tools\mediamtx\mediamtx.exe deploy\mediamtx.dev.yml`
2. **Backend:** ใน `backend\.env` เพิ่ม (ครั้งแรก)
   ```
   VMS_CREDENTIALS_KEY=<จาก python -m app.cli gen-keys>
   VMS_DEV_NO_AUTH=true            # ยังไม่มีหน้า login (B-03/W-05) - ห้ามใช้บนเซิร์ฟเวอร์
   VMS_MEDIAMTX_API_URL=http://127.0.0.1:9997
   ```
   แล้ว `alembic upgrade head` และรัน uvicorn ตามข้างบน
3. **เพิ่ม NVR** (อ่านรายการกล้องให้เอง, รหัสผ่านเก็บแบบเข้ารหัส, กล้องตัวเดียวกันที่ต่อหลาย NVR เก็บครั้งเดียว):
   ```powershell
   .\.venv\Scripts\python.exe -m app.cli add-device --vendor dahua --host 192.168.1.110 --user itc --name "NVR Dahua"
   ```
   (รหัสผ่าน: ถามตอนรัน หรือ `--password-file <ไฟล์>` ที่มีรหัสบรรทัดแรก)

### Web (ต้องมี Node.js 22)
```powershell
cd web
npm install
npm run dev
```
เปิด http://localhost:3000 → จอมอนิเตอร์ (ภาพสด WebRTC), แผนที่ (คลิกกล้องดูภาพสด), ดูย้อนหลัง (จาก NVR)
Next.js ส่ง `/api/*` ต่อไปที่ backend `:8000` (ตั้งใน `next.config.ts`) · หน้าตั้งค่ากล้อง/Topology ยังเรียก `/api/zm` จนกว่าจะเสร็จ W-03/W-06

## ติดตั้งบนเซิร์ฟเวอร์ (Docker)
```bash
cd deploy
cp .env.example .env        # กรอกรหัสผ่านและ key
docker compose up -d --build
```
ยังใช้ไม่ได้จนกว่าจะเสร็จ W-02 (Dockerfile ของ web) และ B-07
