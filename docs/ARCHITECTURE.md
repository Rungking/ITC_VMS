# การออกแบบระบบ ITC VMS

> เอกสารออกแบบ v0.1 (ร่าง) — 2026-11-23
> ITC VMS รวมงาน 2 ส่วนเข้าด้วยกัน
> - **ต้นแบบ itc_vms ของทีม** (Next.js): หน้าภาพสด แผนที่ Topology Dashboard และหน้าตั้งค่ากล้อง
> - **โครงการ CCTV Management Platform** (Python): ไดรเวอร์ Dahua (รวม NetSDK สำหรับ firmware เก่า), การส่งภาพผ่าน MediaMTX, login/สิทธิ์/audit log
>
> โดย**ถอด ZoneMinder ออกทั้งหมด** แล้วให้ระบบเชื่อมกับกล้องและ NVR โดยตรง

---

## 1. ทำไมเลิกใช้ ZoneMinder

| ปัญหาของต้นแบบเดิม | ผลกระทบ | วิธีแก้ในระบบใหม่ |
|---|---|---|
| ZoneMinder ถอดรหัสวิดีโอทุกเฟรมของทุกกล้องบนเซิร์ฟเวอร์ | CPU สูงมาก รับกล้องได้น้อยต่อเครื่อง | MediaMTX ส่งต่อและบันทึกภาพโดย**ไม่ถอดรหัส** (copy stream) |
| ภาพสดเป็น MJPEG (`nph-zms`) | ใช้ bandwidth หลายเท่าของ H.264 เปิดหลายจอแล้วกระตุก | ส่ง H.264 ผ่าน **WebRTC** (latency < 1 วินาที) และ HLS เป็นทางสำรอง |
| หน้าเว็บ login ZoneMinder และดึงกล้องทั้งหมดทุก 5 วินาที | โหลดสูงทั้งเว็บและ ZoneMinder | Backend ตรวจสถานะเองแล้ว**ส่งเฉพาะที่เปลี่ยน**ผ่าน WebSocket |
| ต้องเปิด ZoneMinder ออกภายนอก และ token อยู่ใน URL ภาพที่เบราว์เซอร์เห็น | ใครได้ลิงก์ก็เข้า ZoneMinder ได้ | เบราว์เซอร์ไม่ต่อกล้อง/NVR โดยตรง ดูภาพผ่าน MediaMTX ที่ตรวจสิทธิ์กับ backend |
| ZoneMinder ไม่รองรับ NVR Dahua firmware เก่าที่ RTSP ใช้ไม่ได้ | ดูภาพจาก NVR ในแล็บไม่ได้ | ไดรเวอร์ Dahua มีช่องทาง **NetSDK** (ทดสอบกับ NVR จริงแล้ว) |
| ยังไม่มี login จริง, รหัสผ่านกล้องเก็บเป็นข้อความธรรมดา | ไม่ผ่านเรื่องความปลอดภัย/PDPA | JWT + Argon2, RBAC, audit log, เข้ารหัสรหัสผ่านอุปกรณ์ด้วย Fernet |

---

## 2. ภาพรวมสถาปัตยกรรม

```
 เบราว์เซอร์ (Chrome/Edge)
     │  https://vms.example/        ทุกอย่างผ่านโดเมนเดียว
     ▼
┌──────────────────────────────────────────────┐
│  Reverse proxy (Caddy หรือ nginx) + HTTPS      │
└───┬──────────────────┬───────────────────┬───┘
    │ /                │ /api, /ws         │ /media (WebRTC WHEP, HLS)
┌───▼───────────┐  ┌───▼──────────────┐  ┌─▼──────────────────────┐
│ Web (Next.js)  │  │ API (FastAPI)    │  │ MediaMTX               │
│ หน้าจอจากต้นแบบ  │  │ ผู้ใช้/สิทธิ์/audit   │◄►│ รับภาพจากกล้อง/NVR       │
│ ไม่มีฐานข้อมูลเอง  │  │ อุปกรณ์/กล้อง/แผนที่  │  │ ส่ง WebRTC/HLS          │
└───────────────┘  │ Topology/Layout  │  │ บันทึก fMP4 + playback  │
                   │ WebSocket สถานะ   │  └─▲──────────────────────┘
                   └───┬──────────┬───┘    │ RTSP (ดึงเอง หรือ bridge ส่งเข้า)
                       │          │        │
                ┌──────▼───┐  ┌───▼────────┴───────────────┐
                │PostgreSQL│  │ Workers (Python)           │
                │  Redis   │  │ - health check / sync      │
                └──────────┘  │ - NetSDK → ffmpeg bridge   │
                              │ - รับเหตุการณ์จาก NVR/กล้อง    │
                              └───┬────────────────────────┘
                                  │ HTTP API / RTSP / NetSDK (37777)
                           ┌──────▼────────┐
                           │ กล้อง + NVR     │  VLAN กล้อง (ไม่เปิดออกภายนอก)
                           └───────────────┘
```

**หลักการ**
1. **Next.js เป็นหน้าจออย่างเดียว:** ไม่เก็บข้อมูลเอง ไม่ต่อฐานข้อมูล ไม่ต่อกล้อง (ถอด Prisma, `pg` และ `/api/zm` ออก)
2. **Backend Python เป็นเจ้าของข้อมูลและการคุยกับอุปกรณ์ทั้งหมด** เพราะ Dahua NetSDK มีให้ใช้แค่ Python/C
3. **วิดีโอไม่ผ่านโค้ด Python หรือ Next.js:** ไหลจากกล้องเข้า MediaMTX แล้วไปเบราว์เซอร์ตรงๆ
4. **โดเมนเดียว:** reverse proxy แบ่งเส้นทาง `/`, `/api`, `/media` ไม่มีปัญหา CORS และใช้ cookie login ร่วมกันได้

---

## 3. เทคโนโลยี

| ส่วน | เทคโนโลยี | ที่มา |
|---|---|---|
| หน้าเว็บ | Next.js 16, React 19, TypeScript, Tailwind 4, i18next (ไทย/อังกฤษ) | ต้นแบบของทีม |
| แผนที่ / Topology / กราฟ | Leaflet, React Flow (`@xyflow/react`), Recharts | ต้นแบบของทีม |
| เล่นภาพสด | WebRTC (WHEP) จาก MediaMTX, สำรองด้วย HLS (`hls.js`) | ใหม่ (แทน MJPEG `<img>`) |
| API | Python 3.12, FastAPI, Pydantic v2 | CCTV |
| ฐานข้อมูล | PostgreSQL 16 + SQLAlchemy 2 + Alembic | CCTV (แทน Prisma) |
| Message bus | Redis (Pub/Sub) | CCTV |
| ไดรเวอร์อุปกรณ์ | Dahua HTTP API + **Dahua NetSDK**, ต่อด้วย Hikvision/ONVIF | CCTV |
| วิดีโอ | MediaMTX + ffmpeg (bridge สำหรับ NetSDK) | CCTV |
| Deploy | Docker Compose บน Ubuntu Server LTS | CCTV |

---

## 4. โครงสร้าง repository

```
itc_vms/
  web/        Next.js (โค้ดต้นแบบ ย้ายด้วย git mv ประวัติไม่หาย)
  backend/    FastAPI + drivers + workers (merge มาจาก repo CCTV พร้อมประวัติ git)
  deploy/     docker-compose.yml, mediamtx.yml, .env.example (+ Caddyfile ใน B-07)
  docs/       ARCHITECTURE.md, ROADMAP.md
    tasks/    ติดตามงาน 2 สาย: BACKEND.md (B-xx) และ WEB.md (W-xx)
    cctv/     เอกสารออกแบบเดิมของ CCTV (ไดรเวอร์ Dahua, ผลทดสอบ NVR, PDPA) ใช้อ้างอิง
  tools/      MediaMTX สำหรับพัฒนาบน Windows (ไม่เก็บใน git)
```

---

## 5. ย้ายหน้าจอจากต้นแบบ: เปลี่ยนแหล่งข้อมูลอย่างไร

ทุกหน้าในต้นแบบเรียก `/api/zm` จุดเดียว ระบบใหม่แยกเป็น API ตามเรื่อง

| หน้า/ส่วนในต้นแบบ | เดิมใช้ | ระบบใหม่ใช้ |
|---|---|---|
| `monitor` (ภาพสด) | `<img>` MJPEG จาก ZoneMinder | `<LivePlayer>` WebRTC จาก MediaMTX, ใช้ sub-stream ในจอย่อย, main-stream เมื่อขยายเต็มจอ |
| `page` / Dashboard สถานะ | ZoneMinder `Monitor_Status` ทุก 5 วิ | `GET /api/cameras` + WebSocket `/ws/status` |
| `map`, `settings/map` | `monitor_metadata.latitude/longitude` | `GET/PATCH /api/cameras/{id}` (lat, lng, location) |
| `topology`, `settings/topology` | `parent_id`, `parent_port`, `topo_x/y` ในตารางเดียวกับกล้อง | `/api/topology` + ตาราง `network_node` (switch/router) |
| `settings/camera/table` (+ add/edit) | สร้าง/ลบ monitor ใน ZoneMinder | Wizard เพิ่มอุปกรณ์: `POST /api/devices` → ตรวจยี่ห้อ → ดึงกล้องจาก NVR อัตโนมัติ → `/api/cameras` |
| `LoginDialog`, `AuthProvider` | login ปลอม (เป็น root เสมอ) | `POST /api/auth/login` → JWT ใน **httpOnly cookie**, บทบาท root/admin/user/guest แมปกับ RBAC ของ backend |
| `use-stream-verification` | ping ZoneMinder จากเบราว์เซอร์ | ลบทิ้ง ใช้สถานะจาก backend |
| `LogSidebar` (`lib/logs`) | log ในเบราว์เซอร์ | `GET /api/events`, `GET /api/audit` |
| `LicenseProvider` | TODO | เฟสหลัง |

---

## 6. ข้อมูลหลัก (Data Model)

ใช้โมเดลของ CCTV เป็นฐาน แล้วเพิ่มสิ่งที่ต้นแบบต้องใช้ (แผนที่และ Topology)

```
Site ─┬─ Zone
      ├─ Device (NVR หรือกล้องเดี่ยว: vendor, host, port, credentials(เข้ารหัส), media_path=rtsp|netsdk, status)
      │     └─ Camera (channel, ชื่อ, zone, lat, lng, location_name, recording policy, status)
      └─ NetworkNode (switch/router/AP: ชื่อ, รุ่น, IP, จำนวนพอร์ต, lat, lng)
TopologyLink (child=Camera|Device|NetworkNode, parent=NetworkNode, parent_port, connection_type)
TopologyPosition (node, x, y)          ← ตำแหน่งบนหน้า Topology
User ─ Role ─ Permission (ต่อ Zone/Camera)
Layout (owner, shared, grid JSON)
Recording, Event, AuditLog             ← ตาม CCTV
```

ข้อมูลเดิมใน `monitor_metadata` ของต้นแบบ (ถ้ามีใช้งานจริง) จะย้ายด้วยสคริปต์นำเข้าครั้งเดียว

---

## 7. วิดีโอ

- **ภาพสด:** MediaMTX ดึงภาพ**เฉพาะเมื่อมีคนดู** (on-demand) ถ้าอุปกรณ์ใช้ RTSP ได้ให้ MediaMTX ดึงเอง ถ้าเป็น NVR firmware เก่า worker จะเปิด NetSDK → ffmpeg → publish เข้า MediaMTX และเปิดใหม่อัตโนมัติเมื่อหลุด
- **สิทธิ์ดูภาพ:** MediaMTX ถาม backend ทุกครั้งที่มีคนขอดู (`authHTTPAddress`) backend ตรวจ cookie และสิทธิ์ของผู้ใช้ต่อกล้องนั้น
- **บันทึก:** MediaMTX บันทึก fMP4 แบบไม่ถอดรหัส ตั้งนโยบายต่อกล้องได้ (ต่อเนื่อง/เหตุการณ์/ไม่บันทึก)
- **ย้อนหลัง:** ดูจากเซิร์ฟเวอร์ผ่าน MediaMTX playback และดูจาก NVR ผ่านไดรเวอร์
- ⚠️ ต้องตั้ง sub-stream ของกล้องเป็น **H.264** เพราะเบราว์เซอร์ยังเล่น H.265 ผ่าน WebRTC ไม่ได้ทุกเครื่อง

### 7.1 ค่าเริ่มต้นการบันทึก

| ค่า | ค่าเริ่มต้น | ปรับได้ที่ |
|---|---|---|
| ระยะเวลาเก็บ | **15 วัน** | ค่าระบบ และแยกรายกล้อง |
| คุณภาพ | **1080p** (บันทึก main stream) | ค่าระบบ และแยกรายกล้อง: 1080p / ภาพประหยัด (sub stream) |
| รูปแบบ | ต่อเนื่อง | ต่อเนื่อง / เฉพาะเหตุการณ์ / ไม่บันทึก |

- กล้องที่ไม่ได้ตั้งค่าเองจะใช้ค่าระบบ เปลี่ยนค่าระบบแล้วมีผลกับกล้องเหล่านั้นทันที
- MediaMTX บันทึกภาพ**ตามที่กล้องส่งมา**โดยไม่แปลง จึงต้องตั้ง main stream ของกล้องเป็น 1080p (เฟสหลังให้ไดรเวอร์ตั้งค่ากล้องให้อัตโนมัติ) ถ้ากล้องส่ง 4K มาจะบันทึกเป็น 4K และใช้ดิสก์มากขึ้น
- หน้าตั้งค่าแสดงประมาณการพื้นที่ดิสก์ทุกครั้งที่ปรับค่า

**⚠️ ประมาณการพื้นที่ดิสก์ที่ค่าเริ่มต้น (1080p ต่อเนื่อง 15 วัน)**

| | H.264 (~4 Mbps) | H.265 (~2 Mbps) |
|---|---|---|
| ต่อกล้อง | ~650 GB | ~325 GB |
| 16 กล้อง (NVR 1 เครื่อง) | ~10 TB | ~5 TB |
| 256 กล้อง | ~166 TB | ~83 TB |

ถ้างบดิสก์ไม่พอ ให้ปรับรายกล้อง เช่น กล้องสำคัญเก็บ 1080p ส่วนที่เหลือเก็บภาพประหยัด หรือบันทึกเฉพาะเหตุการณ์ และให้ NVR เป็นที่เก็บภาพความละเอียดเต็ม

รายละเอียดไดรเวอร์ Dahua, ผลทดสอบ NVR จริง, ระบบแจ้งเตือน และ PDPA อยู่ที่ [docs/cctv/ARCHITECTURE.md](cctv/ARCHITECTURE.md)

---

## 8. การตัดสินใจ (2026-11-23)

| เรื่อง | ข้อสรุป |
|---|---|
| ผู้ดูแล backend Python | เจ้าของโครงการทำเองทั้งหมดในช่วงแรก |
| โค้ด CCTV | merge เข้ามาพร้อมประวัติ git แล้ว (`backend/`, `deploy/`); เอกสารเดิมอยู่ที่ `docs/cctv/`; ไม่ใช้ frontend React เดิม |
| การติดตามงาน | แยก 2 สายตามเครื่องมือ: [Backend](tasks/BACKEND.md) และ [Web](tasks/WEB.md) |
| กล้อง Bodyworn (Pe IMS) | **ไม่รวม**ใน ITC VMS ตอนนี้ แยกทำเป็นโครงการต่างหากร่วมกับ partner |
| การเก็บภาพ | ค่าเริ่มต้น 15 วัน 1080p ปรับได้ทั้งระดับระบบและรายกล้อง (ข้อ 7.1) |
| ข้อมูลเดิมในต้นแบบ | **ยังไม่ได้คำตอบ:** ถ้ามีข้อมูลใช้งานจริงใน `monitor_metadata` จะทำสคริปต์นำเข้า (B-16) |
