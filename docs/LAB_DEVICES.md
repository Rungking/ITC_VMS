# อุปกรณ์ในห้องแล็บ และ API ที่ใช้ดึงข้อมูล

> บันทึก 2026-11-26 · อุปกรณ์จริงที่ใช้ทดสอบ ITC VMS
> **ห้ามเขียนรหัสผ่านอุปกรณ์ในไฟล์นี้** ให้เก็บใน `.env` หรือฐานข้อมูล (เข้ารหัส ตาม B-11)

## 1. รายการอุปกรณ์

| # | อุปกรณ์ | ยี่ห้อ | รุ่น / firmware | IP | บทบาท |
|---|---|---|---|---|---|
| 1 | NVR (รุ่นเก่า) | Dahua | DHI-NVR5416-16P-4KS2 / 3.210 (2016)* | _ยังไม่บันทึก_ | บันทึกภาพ, ย้อนหลัง |
| 2 | NVR (รุ่นใหม่) | Hikvision | _ยังไม่บันทึก_ | _ยังไม่บันทึก_ | บันทึกภาพ, ย้อนหลัง |
| 3 | PoE Switch | Hikvision | _ยังไม่บันทึก_ (Managed หรือ Unmanaged?) | _ยังไม่บันทึก_ | จ่ายไฟ/เครือข่ายให้กล้อง, โหนดใน Topology |
| 4 | กล้อง ALPR | Dahua | _ยังไม่บันทึก_ | _ยังไม่บันทึก_ | ภาพสด + อ่านป้ายทะเบียน |
| 5 | กล้องทั่วไป | Dahua | _ยังไม่บันทึก_ | _ยังไม่บันทึก_ | ภาพสด |
| 6 | กล้องทั่วไป | Hikvision | _ยังไม่บันทึก_ | _ยังไม่บันทึก_ | ภาพสด |

\* น่าจะเป็นเครื่องเดียวกับที่ทดสอบไว้ใน [cctv/ARCHITECTURE.md](cctv/ARCHITECTURE.md) หัวข้อผลทดสอบกับเครื่องจริง ต้องยืนยันอีกครั้ง

## 2. แนวทาง: ดึงข้อมูลผ่าน HTTP API ของผู้ผลิต

ใช้ **Dahua HTTP API (CGI)** และ **Hikvision ISAPI** เป็นช่องทางหลัก เพราะมีเอกสารและตัวอย่างบนเว็บ/GitHub มาก
RTSP ใช้เฉพาะวิดีโอ ส่วน NetSDK ใช้เมื่อ HTTP/RTSP ใช้ไม่ได้ (NVR Dahua firmware เก่า)

### 2.1 Dahua HTTP API — อุปกรณ์ #1, #4, #5

Digest auth เป็นหลัก (**NVR #1 firmware เก่าใช้ Basic auth** และส่ง error มาพร้อม HTTP 200)

| งาน | Endpoint | หมายเหตุ |
|---|---|---|
| ข้อมูลเครื่อง | `GET /cgi-bin/magicBox.cgi?action=getSystemInfo` | |
| เวอร์ชัน firmware | `GET /cgi-bin/magicBox.cgi?action=getSoftwareVersion` | |
| ค่าตั้ง | `GET /cgi-bin/configManager.cgi?action=getConfig&name=<Name>` | |
| ภาพนิ่ง | `GET /cgi-bin/snapshot.cgi?channel=1` | NVR #1 ตอบ HTTP 500 |
| รับเหตุการณ์สด | `GET /cgi-bin/eventManager.cgi?action=attach&codes=[All]&heartbeat=5` | multipart stream; NVR #1 ไม่มี heartbeat |
| ป้ายทะเบียน + ภาพ (สด) | `GET /cgi-bin/snapManager.cgi?action=attachFileProc&Flags[0]=Event&Events=[TrafficJunction]` | #4 ALPR; ชื่อ event อาจต่างตามรุ่น ให้ดูจาก `attach codes=[All]` ตอนรถผ่าน |
| ค้นประวัติป้ายทะเบียน | `GET /cgi-bin/recordFinder.cgi?action=find&name=TrafficSnapEventInfo` | #4 ALPR (เก็บในกล้อง/SD card) |
| รายการทะเบียนอนุญาต/ห้าม | `recordUpdater.cgi` / `recordFinder.cgi` กับ `name=TrafficRedList` / `TrafficBlackList` | #4 ALPR |
| ค้นไฟล์ย้อนหลัง | `mediaFileFind.cgi` (`factory.create` → `findFile` → `findNextFile` → `close`) | |
| วิดีโอสด | `rtsp://<ip>:554/cam/realmonitor?channel=1&subtype=0` (1 = ภาพย่อย) | NVR #1 ค้าง → ใช้ NetSDK (พอร์ต 37777) |

ไดรเวอร์ที่มีแล้ว: `backend/app/drivers/dahua/` (HTTP + NetSDK) · อ้างอิง: [rroller/dahua](https://github.com/rroller/dahua)

### 2.2 Hikvision ISAPI — อุปกรณ์ #2, #3 (ถ้าเป็น Managed), #6

Digest auth, รับส่ง XML (รุ่นใหม่รองรับ JSON ด้วย `?format=json` ในบาง endpoint)

| งาน | Endpoint | หมายเหตุ |
|---|---|---|
| ข้อมูลเครื่อง | `GET /ISAPI/System/deviceInfo` | |
| สถานะ (CPU, หน่วยความจำ) | `GET /ISAPI/System/status` | |
| รายการกล้องใน NVR | `GET /ISAPI/ContentMgmt/InputProxy/channels` (+ `/status`) | #2 |
| สถานะดิสก์ NVR | `GET /ISAPI/ContentMgmt/Storage` | #2 |
| ภาพนิ่ง | `GET /ISAPI/Streaming/channels/101/picture` | `101` = ช่อง 1 ภาพหลัก, `102` = ภาพย่อย |
| รับเหตุการณ์สด | `GET /ISAPI/Event/notification/alertStream` | multipart stream |
| ค้นไฟล์ย้อนหลัง | `POST /ISAPI/ContentMgmt/search` (XML `CMSearchDescription`) | |
| ดาวน์โหลดคลิป | `GET /ISAPI/ContentMgmt/download` | ใช้ `playbackURI` จากผลค้นหา |
| วิดีโอสด | `rtsp://<ip>:554/Streaming/Channels/101` | |
| วิดีโอย้อนหลัง | `rtsp://<ip>:554/Streaming/tracks/101?starttime=YYYYMMDDThhmmssZ` | |

PoE Switch #3: ถ้าเป็นรุ่น Smart/Managed อาจดึงสถานะพอร์ตและกำลังไฟ PoE ได้ (ISAPI หรือ SNMP) ถ้าเป็น Unmanaged ไม่มี API ใส่เป็น `NetworkNode` ใน Topology ด้วยมือ

ยังไม่มีไดรเวอร์ (`HikvisionDriver` อยู่ในแผนเฟสถัดไป) · อ้างอิง: pyHik, เอกสาร ISAPI ของ Hikvision

## 3. ขั้นต่อไป

- [ ] กรอกรุ่น, firmware และ IP ของทุกเครื่องในตารางข้อ 1
- [ ] รัน `probe` (CLI ที่มีอยู่) กับอุปกรณ์ Dahua #4, #5 และยืนยันว่า NVR #1 คือเครื่องที่ทดสอบแล้ว
- [ ] ทดลองเรียก ISAPI `deviceInfo` กับ #2, #6 และดูว่า Switch #3 มี API หรือไม่
- [ ] จับชื่อ event จริงของกล้อง ALPR #4 ตอนรถผ่าน
