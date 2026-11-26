# อุปกรณ์ในห้องแล็บ และ API ที่ใช้ดึงข้อมูล

> บันทึก 2026-11-26 · อุปกรณ์จริงที่ใช้ทดสอบ ITC VMS
> **ห้ามเขียนรหัสผ่านอุปกรณ์ในไฟล์นี้** ให้เก็บใน `.env` หรือฐานข้อมูล (เข้ารหัส ตาม B-11)

## 1. รายการอุปกรณ์

ทุกเครื่องย้ายมาวง 192.168.1.x แล้ว (2026-11-26)

| # | อุปกรณ์ | ยี่ห้อ | รุ่น / firmware | IP | ผู้ใช้ API | บทบาท |
|---|---|---|---|---|---|---|
| 1 | NVR (รุ่นเก่า) | Dahua | DHI-NVR5416-16P-4KS2 / 3.210 (2016)* | 192.168.1.110 | itc | บันทึกภาพ, ย้อนหลัง |
| 2 | NVR (รุ่นใหม่) | Hikvision | **DS-7616NXI-K2/16P(D)** / V4.84.100 build 250918 (MAC 88:DE:39:EC:28:B2) | 192.168.1.168 | admin | บันทึกภาพ, ย้อนหลัง · ch1 = กล้อง #6, ch2 = กล้อง #5 |
| 3 | PoE Switch | Hikvision | **DS-3E1310P-EI/M** (Smart Managed) / V3.0.9 build 250115 | 192.168.1.64 | admin | จ่ายไฟ/เครือข่ายให้กล้อง, โหนดใน Topology |
| 4 | กล้อง ALPR | Dahua | **ITC237-PW1A-IRZ** / 2.202.0000.1.R (2017-02-28), S/N 3B02153PAJ00001 | 192.168.1.111 (เดิม .108) | admin | ภาพสด + อ่านป้ายทะเบียน |
| 5 | กล้องทั่วไป | Dahua | **IPC-HFW5431E-Z** / 2.460.0000.1.R (2016-10-25) | 192.168.1.112 (เดิม 192.168.2.21) | admin | ภาพสด · ต่อเข้าทั้ง NVR #1 (ch2) และ NVR #2 (ch2) |
| 6 | กล้องทั่วไป | Hikvision | **DS-2CD2721G0-IZ** / V5.7.21 build 240422 (MAC 24-48-45-8A-47-DF) | 192.168.1.113 (เดิม 192.168.254.12) | admin | ภาพสด |

**ผลทดสอบ Dahua CGI ทีละ endpoint (2026-11-26):**

| endpoint | NVR #1 (Basic) | ALPR #4 (Basic) | กล้อง #5 (Digest) |
|---|---|---|---|
| magicBox getDeviceType / getSystemInfo / getSoftwareVersion / getMachineName | 200 | 200 | 200 |
| configManager ChannelTitle / Encode | 200 (16 ช่อง) | 200 (1 ช่อง) | 200 |
| snapshot.cgi | ค้าง (timeout 8 วิ) | ค้าง (timeout 8 วิ) | 200 (~170 KB) |

**ผล `probe` ด้วยไดรเวอร์ที่แก้แล้ว (2026-11-26):**

| เครื่อง | ข้อมูลเครื่อง/ช่อง | ช่องทางภาพ | ภาพนิ่ง |
|---|---|---|---|
| NVR #1 .110 | S/N 2M051CBPAMSXATY · 2/16 ช่องมีกล้อง: ch1 = ALPR .111, ch2 = "IPC" .112 | **RTSP ใช้ได้แล้ว** (ch2: H.264 + PCMA) | ได้ (ch2, 166 KB) |
| ALPR #4 .111 | S/N 3B02153PAJ00001 · 1 ช่อง | RTSP `/cam/realmonitor` ตอบ **404** → สลับไป NetSDK | **ไม่ได้**: NetSDK snapshot "Protocol error / network timeout" และดึงเฟรมจากวิดีโอ NetSDK ไม่ได้ |
| กล้อง #5 .112 | S/N 2L05595PAA00269 · 1 ช่อง | RTSP (H.264 + PCMA) | ได้ (170 KB) |

**ผล ISAPI ของ Hikvision (2026-11-26, Digest MD5):**

| endpoint | NVR #2 .168 | กล้อง #6 .113 | Switch #3 .64 |
|---|---|---|---|
| System/deviceInfo, status, time, Network/interfaces, capabilities | 200 | 200 | 200 |
| Streaming/channels | 200 | 200 | 403 |
| ContentMgmt/InputProxy/channels (+status) | 200 | 403 (ไม่ใช่ NVR) | 403 |
| ContentMgmt/Storage | 200 | 200 | 403 |
| Event/triggers | 200 | 500 | 403 |
| ภาพนิ่ง Streaming/channels/101/picture | 200 (17 KB, ภาพจากกล้อง #6 "Server Rm01") | 200 (81 KB) | 403 |

**ผล `probe --vendor hikvision` ด้วย HikvisionDriver (B-17, 2026-11-26):**

| เครื่อง | ผล |
|---|---|
| NVR #2 .168 | 2/16 ช่องมีกล้อง: ch1 = กล้อง #6 .113 ("Server Rm01"), ch2 = **กล้อง Dahua #5 .112** ("IPC") · RTSP ch2 200 OK H.264 · ภาพนิ่งได้ |
| กล้อง #6 .113 | 1 ช่อง · RTSP sub stream **H.265** · ภาพนิ่งได้ (84 KB) · alertStream: heartbeat ทุก ~1 วิ, VMD ส่งซ้ำหลายครั้งต่อวินาที |
| Switch #3 .64 | ไดรเวอร์แจ้งว่าเป็นสวิตช์ ไม่ใช่อุปกรณ์วิดีโอ (ตั้งใจ: สวิตช์เข้าระบบเป็น NetworkNode ใน B-04) |

**ทดสอบผ่านหน้าเว็บ ITC VMS (B-19, 2026-11-26):**
- กล้องในระบบ 3 ตัว (หนึ่งแถวต่อกล้องจริง): #4 ALPR ผ่าน NVR Dahua ch1, #5 ผ่าน NVR Dahua ch2, #6 ผ่าน NVR Hikvision ch1 · กล้อง #5 ต่อทั้ง 2 NVR แต่เก็บครั้งเดียว (ตาม IP)
- ภาพสด WebRTC ได้ทั้ง 3 ตัว · #4 ALPR **ไม่มี sub stream** ผ่าน NVR (ใช้ main 1920×1080 แทนอัตโนมัติ)
- ย้อนหลังจาก NVR Dahua ได้ (`cam/playback`, เล่นภาพ 2688×1520 ของกล้อง #5)
- **NVR Hikvision ไม่มีฮาร์ดดิสก์** (hdd1/hdd2 = notexist, ไม่ได้เปิดบันทึก) จึงยังดูย้อนหลังจาก NVR นี้ไม่ได้ · ช่องว่างของ NVR นี้รายงาน `connMode=plugplay`, `chanDetectResult=notExist`
- กล้อง #6 เดิมส่ง sub stream เป็น H.265 (ตารางข้างบน) · **เปลี่ยน main/sub เป็น H.264 แล้ว** (2026-11-26) เพื่อให้เบราว์เซอร์เล่นผ่าน WebRTC ได้
- กล้อง #6 ตั้งเขตเวลาเป็น **+08:00** ส่วน NVR เป็น +07:00 ต้องแก้เขตเวลาของกล้อง
- Switch ใช้ endpoint กลุ่ม System ได้ ส่วนสถานะพอร์ต/PoE ต้องหา endpoint เฉพาะของ switch ต่อ

งานค้างของ ALPR: หา RTSP path ที่ถูกของรุ่น ITC (หรือดูภาพผ่าน NVR ch1 แทน) และรับเหตุการณ์ป้ายทะเบียน (`snapManager` / `TrafficJunction`)

ไดรเวอร์เดิมล้มด้วย "Invalid Authority" เพราะ endpoint เสริม (`getSerialNo` / `RemoteDevice`) ถูกปฏิเสธบน firmware เก่า แก้แล้วให้ endpoint เสริมที่ถูกปฏิเสธคืนค่าว่างแทน

ผลทดสอบ login ผ่าน API ครั้งแรก (2026-11-26): ดึงภาพนิ่งจาก #5 (Dahua CGI) และ #6 (ISAPI) ได้ · รอบถัดมา login ไม่ผ่านทุกเครื่อง น่าจะติดล็อกจากการลองหลายรอบติดกัน ต้องทดสอบซ้ำ · #6 นาฬิกายังเป็นปี 1970 ต้องตั้งเวลา/NTP

\* เครื่องเดียวกับที่ทดสอบไว้ใน [cctv/ARCHITECTURE.md](cctv/ARCHITECTURE.md) (รุ่นยืนยันจาก ONVIF แล้ว)

### ผลสำรวจวงแลนแบบไม่ใช้รหัสผ่าน (2026-11-26, จากเครื่องพัฒนา 192.168.1.7)

ใช้ TCP port scan + Hikvision SADP + ONVIF WS-Discovery

| IP | พอร์ตที่เปิด | ข้อสังเกต |
|---|---|---|
| 192.168.1.64 | 80, 443, 8000 | ISAPI ตอบ 401 Digest realm `DS-3E1310P-EI/M` · SADP: **ยังไม่ Activate** (ยังไม่ได้ตั้งรหัสผ่าน ต้อง activate ก่อนใช้ ISAPI) |
| 192.168.1.108 | 80, 443, 554, 3800, 5000, 37777 | Dahua CGI ตอบ 401 **Basic** realm `Device_CGI` · ONVIF: ITC237-PW1A-IRZ, มี PTZ |
| 192.168.1.110 | 80, 554, 37777 | Dahua CGI ตอบ 401 Basic · ONVIF: DHI-NVR5416-16P-4KS2 |

อุปกรณ์ #2, #5, #6 ไม่ตอบทั้ง port scan, SADP และ ONVIF ในวง 192.168.1.x: อาจยังไม่ได้เสียบ/จ่ายไฟ หรือต่ออยู่ที่พอร์ต PoE ของ NVR (วงภายในของ NVR)

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
