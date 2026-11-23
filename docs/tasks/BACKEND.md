# งานสาย Backend (B)

> Python / FastAPI / ไดรเวอร์อุปกรณ์ / MediaMTX / deploy · กติกาอยู่ที่ [README.md](README.md)
> ผู้รับผิดชอบ: เจ้าของโครงการ (ทำเองทั้งหมดในช่วงแรก)

## ค้างไว้

_(เขียนตรงนี้ก่อนสลับไปสาย Web ว่าหยุดที่ไหน)_

---

## Phase 0: รวมโค้ดและถอด ZoneMinder

- [x] **B-01** ย้าย backend, deploy และเอกสารจากโครงการ CCTV เข้า repo พร้อมประวัติ git, ตั้ง venv และรันเทสต์ผ่าน (29 tests)
- [ ] **B-02** เปลี่ยนชื่อจาก CCTV เป็น ITC VMS: prefix ตัวแปร `CCTV_*` → `VMS_*`, ชื่อแพ็กเกจ, ชื่อ project/ฐานข้อมูลใน compose, ผู้ใช้ใน Dockerfile
- [ ] **B-03** Login แบบ cookie: `POST /api/auth/login` ตั้ง JWT ใน httpOnly cookie, `GET /api/auth/me`, `POST /api/auth/logout` · ส่งต่อ: W-05
- [ ] **B-04** Data model: Camera เพิ่ม `lat`, `lng`, `location_name`; ตารางใหม่ `NetworkNode`, `TopologyLink`, `TopologyPosition` + Alembic migration · ส่งต่อ: W-04, W-14
- [ ] **B-05** API อุปกรณ์/กล้อง/Topology: `/api/devices`, `/api/cameras`, `/api/topology` (CRUD + ตรวจสิทธิ์ + audit) · ต้องการ: B-04 · ส่งต่อ: W-04, W-06
- [ ] **B-06** ค่าตั้งการบันทึก: ค่าเริ่มต้นของระบบ **เก็บ 15 วัน, ภาพ 1080p (main stream)** และกำหนดแยกรายกล้องได้ (model + API `/api/settings/recording`, `/api/cameras/{id}/recording`) · ส่งต่อ: W-15
- [ ] **B-07** `docker compose up` บน Linux + reverse proxy (Caddy) โดเมนเดียว: `/` → web, `/api` `/ws` → api, `/media` → MediaMTX · ต้องการ: W-02
- [ ] **B-08** CI ฝั่ง backend: ruff + pytest

## Phase 1: อุปกรณ์ ภาพสด แผนที่ Topology

- [ ] **B-10** Wizard API: ตรวจอุปกรณ์จาก IP/user/pass → ยี่ห้อ + ช่องทางภาพ (RTSP/NetSDK) → รายการกล้องจาก NVR → สร้างกล้องทีละหลายตัว · ส่งต่อ: W-12
- [ ] **B-11** รหัสผ่านอุปกรณ์เข้ารหัสในฐานข้อมูล และไม่ส่งกลับไปหน้าเว็บ
- [ ] **B-12** Stream worker: เปิด NetSDK bridge เมื่อมีคนดู ปิดเมื่อไม่มีคนดู เปิดใหม่เองเมื่อหลุด; อุปกรณ์ RTSP ให้ MediaMTX ดึงเอง (on-demand) · ต้องการ: B-10
- [ ] **B-13** MediaMTX ตรวจสิทธิ์ผู้ชมกับ backend (`authHTTPAddress`) · ต้องการ: B-03 · ส่งต่อ: W-10
- [ ] **B-14** Health check worker + WebSocket `/ws/status` ส่งเฉพาะสถานะที่เปลี่ยน · ส่งต่อ: W-13
- [ ] **B-15** Layout API: บันทึก/โหลด/แชร์ layout ภาพสด · ส่งต่อ: W-11
- [ ] **B-16** สคริปต์นำเข้าข้อมูลจาก `monitor_metadata` ของต้นแบบ (ทำเฉพาะถ้ามีข้อมูลใช้งานจริง: **รอคำตอบ**)

## Phase 2: บันทึกและย้อนหลัง

- [ ] **B-20** ใช้ค่าตั้งการบันทึก (B-06) สร้าง path บันทึกใน MediaMTX ต่อกล้อง · ต้องการ: B-06, B-12
- [ ] **B-21** ดัชนีไฟล์บันทึก + งานลบไฟล์เกินจำนวนวัน + เตือนเมื่อดิสก์ใกล้เต็ม
- [ ] **B-22** ค้นหาและเล่นย้อนหลังจาก NVR ผ่านไดรเวอร์ (HTTP API และ NetSDK) · ส่งต่อ: W-20
- [ ] **B-23** ส่งออกคลิป `.mp4` + audit log · ส่งต่อ: W-21

## Phase 3: แจ้งเตือน

- [ ] **B-30** Worker รับเหตุการณ์จาก NVR/กล้อง (HTTP event stream + NetSDK alarm) พร้อม reconnect
- [ ] **B-31** แปลงเป็นเหตุการณ์กลาง + รวมเหตุการณ์ซ้ำระหว่างกล้องกับ NVR
- [ ] **B-32** Snapshot ตอนเกิดเหตุ + `/api/events` + ส่งทาง WebSocket · ส่งต่อ: W-30, W-31

## Phase 4: ทดสอบระบบใหญ่และนำร่อง

- [ ] **B-40** Load test 256 กล้อง / 10 NVR, ยืนยันสเปกเซิร์ฟเวอร์และพื้นที่ดิสก์
- [ ] **B-41** Hardening: HTTPS, ล็อกบัญชีเมื่อใส่รหัสผิด, สำรองฐานข้อมูลอัตโนมัติ
- [ ] **B-42** คู่มือติดตั้งสำหรับทีมช่าง
