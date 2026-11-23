# การออกแบบระบบ CCTV Management Platform

> เอกสารออกแบบ v0.1 — 2026-11-23
> ระบบนี้เชื่อมต่อกล้องวงจรปิดและเครื่องบันทึกภาพ (NVR) หลายยี่ห้อ เริ่มจาก **Dahua** แล้วขยายไปที่ **Hikvision, Uniview และ ONVIF**
> ผู้ใช้หลักคือ **พนักงานเทศบาล** ที่มีความรู้เรื่อง CCTV ไม่มาก ระบบจึงต้อง "ใช้ง่ายแต่ทำงานแบบมืออาชีพ"

---

## 1. เป้าหมายและข้อกำหนด

| หมวด | ความสามารถ |
|---|---|
| ดูภาพสด | แบ่งจอ 1/4/9/16/25/36 ช่อง, จัด Layout เอง, ลากกล้องจากรายการไปวางในช่อง (drag & drop), บันทึก Layout, ถ่ายภาพนิ่ง (snapshot) แล้วบันทึกเป็นไฟล์ |
| บันทึกภาพ | บันทึกภาพลงเซิร์ฟเวอร์ของเราเอง กำหนดนโยบายการบันทึกและระยะเวลาเก็บแยกรายกล้องได้ |
| ดูย้อนหลัง | ดูจากเซิร์ฟเวอร์ **และ** ดูจาก NVR โดยตรงผ่านหน้าจอ timeline เดียวกัน และส่งออกคลิปได้ |
| แจ้งเตือน | Motion พื้นฐาน, AI จากกล้อง (เช่น ข้ามเส้น บุกรุกพื้นที่ คน/รถ), AI จาก NVR |
| ขนาดระบบช่วงทดลอง | ~256 กล้อง, ~10 NVR, ติดตั้งในเครื่องขององค์กร (on-premise) |
| ทีมพัฒนา | Python |

**หลักการออกแบบ**
1. **แยกระบบออกเป็นชั้นๆ**: ส่วนเชื่อมอุปกรณ์ ส่วนวิดีโอ ส่วนตรรกะธุรกิจ และหน้าจอ แยกจากกันทั้งหมด
2. **รองรับหลายยี่ห้อผ่าน Driver**: โค้ดหลักไม่รู้จักยี่ห้อกล้อง รู้จักแค่ interface กลาง
3. **ไม่ส่งวิดีโอผ่านโค้ด Python**: ใช้ Media Server ที่ออกแบบมาเพื่องานวิดีโอโดยเฉพาะ
4. **ผู้ใช้ไม่ต้องรู้ศัพท์เทคนิค**: ไม่ต้องรู้จัก RTSP, channel หรือ stream ระบบจัดการให้เองทั้งหมด

---

## 2. ภาพรวมสถาปัตยกรรม

```
                         ┌──────────────────────────────────────┐
  เบราว์เซอร์ผู้ใช้  ───►   │  Web UI (React + TypeScript)         │
  (Chrome/Edge)          │  ภาพสด / ย้อนหลัง / แจ้งเตือน / ตั้งค่า     │
                         └──────┬───────────────────┬───────────┘
                    REST + WebSocket            WebRTC / HLS (วิดีโอ)
                                │                   │
┌───────────────────────────────▼────┐   ┌──────────▼───────────────────┐
│  API Server (Python / FastAPI)     │   │  Media Server (MediaMTX)     │
│  - ผู้ใช้ สิทธิ์ (RBAC) Audit log        │◄─►│  - ดึง RTSP จากกล้อง/NVR       │
│  - จัดการอุปกรณ์/กล้อง/Layout           │   │  - แปลงเป็น WebRTC/HLS        │
│  - ค้นหาและเล่นย้อนหลัง                 │   │  - บันทึกไฟล์ (fMP4 segment)    │
│  - ศูนย์แจ้งเตือน                        │   │  - Playback server           │
└───────┬──────────────────┬─────────┘   └──────────▲───────────────────┘
        │                  │                        │ RTSP
        │   ┌──────────────▼─────────────┐          │
        │   │ Device Workers (Python)    │          │
        │   │ - Event listener ต่อเนื่อง    │          │
        │   │ - Health check / sync      │          │
        │   └──────────────┬─────────────┘          │
        │                  │                        │
        │   ┌──────────────▼────────────────────────┴──┐
        │   │  Driver Layer                            │
        │   │  DahuaDriver │ HikvisionDriver │          │
        │   │  UniviewDriver │ OnvifDriver             │
        │   └──────────────┬───────────────────────────┘
        │                  │ HTTP API / RTSP
        │          ┌───────▼────────┐
        │          │ กล้อง + NVR      │   (แยก VLAN กล้องออกจากเครือข่ายสำนักงาน)
        │          └────────────────┘
┌───────▼────────┐   ┌───────────┐   ┌──────────────────────┐
│ PostgreSQL     │   │ Redis     │   │ Storage (ไฟล์วิดีโอ/ภาพ) │
│ ข้อมูลหลัก/เหตุการณ์ │   │ Pub/Sub   │   │ NAS / DAS / RAID     │
└────────────────┘   └───────────┘   └──────────────────────┘
```

### เทคโนโลยีที่เลือก

| ส่วน | เทคโนโลยี | เหตุผล |
|---|---|---|
| API | Python 3.12, **FastAPI**, Pydantic v2 | ทีมถนัด Python, async รองรับการเชื่อมต่ออุปกรณ์จำนวนมาก, สร้างเอกสาร API (OpenAPI) ให้อัตโนมัติ |
| ORM / Migration | SQLAlchemy 2 + Alembic | มาตรฐานอุตสาหกรรม อัปเกรด schema ได้อย่างปลอดภัย |
| ฐานข้อมูล | **PostgreSQL 16+** | เสถียร รองรับ JSONB สำหรับ metadata ของเหตุการณ์ AI |
| Message bus | **Redis** (Pub/Sub + Streams) | ส่งเหตุการณ์จาก Worker ไปหา API/WebSocket |
| HTTP client | httpx (async, Digest auth) | กล้องและ NVR ทุกยี่ห้อใช้ Digest auth |
| ONVIF | onvif-zeep-async | ไลบรารี ONVIF แบบ async ที่ยังมีการพัฒนาต่อเนื่อง |
| วิดีโอ | **MediaMTX** | รับ RTSP แล้วส่งต่อเป็น WebRTC/HLS, บันทึก fMP4, มี playback server และ Control API ในตัว เขียนด้วย Go ใช้ทรัพยากรน้อย |
| หน้าเว็บ | React + TypeScript + Vite | ระบบนิเวศใหญ่, มี grid/drag-drop ให้ใช้ |
| UI kit | Ant Design หรือ MUI | Component ครบ รองรับภาษาไทย |
| Grid / DnD | react-grid-layout + dnd-kit | แบ่งจอ ลากวาง และบันทึก Layout |
| Deploy | **Docker Compose** บน Ubuntu Server LTS | ติดตั้ง ย้ายเครื่อง และอัปเดตง่าย เหมาะกับลูกค้าหลายเทศบาล |

> หมายเหตุ: ทีมถนัด Python แต่หน้าเว็บที่ใช้ง่ายและลื่นไหลต้องใช้ TypeScript/React ควรมีคนดูแล frontend อย่างน้อย 1 คน

---

## 3. Driver Layer: หัวใจของการรองรับหลายยี่ห้อ

โค้ดส่วนอื่นเรียกใช้แค่ interface กลางนี้ ไม่ว่าอุปกรณ์จะเป็นยี่ห้ออะไร

```python
class DeviceDriver(Protocol):
    capabilities: set[Capability]          # LIVE, PTZ, PLAYBACK, EVENTS, AI_EVENTS, ...

    async def get_device_info(self) -> DeviceInfo: ...
    async def list_channels(self) -> list[ChannelInfo]: ...          # NVR -> รายการกล้อง
    async def get_stream_url(self, ch: int, stream: StreamType) -> str: ...   # main/sub
    async def get_snapshot(self, ch: int) -> bytes: ...
    async def search_recordings(self, ch: int, start, end) -> list[RecordSegment]: ...
    async def get_playback_url(self, ch: int, start, end) -> str: ...
    def subscribe_events(self) -> AsyncIterator[DeviceEvent]: ...    # motion + AI
    async def ptz(self, ch: int, cmd: PtzCommand) -> None: ...       # เฟสหลัง
```

เหตุการณ์จากทุกยี่ห้อจะถูกแปลงเป็นรูปแบบกลาง (`NormalizedEvent`) เช่น `motion`, `line_crossing`, `intrusion`, `human`, `vehicle`, `face`, `video_loss`, `tamper`, `disk_error`

### 3.1 Dahua (เฟสแรก)

ใช้ **Dahua HTTP API (CGI)** เป็นหลัก ใช้งานได้ทั้งกล้องและ NVR และไม่ต้องติดตั้ง SDK

| งาน | Endpoint (Dahua HTTP API) |
|---|---|
| ข้อมูลเครื่อง | `/cgi-bin/magicBox.cgi?action=getSystemInfo`, `getDeviceType` |
| รายการช่อง | `/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle` |
| Snapshot | `/cgi-bin/snapshot.cgi?channel=N` |
| ภาพสด | `rtsp://host:554/cam/realmonitor?channel=N&subtype=0\|1` |
| ค้นหาไฟล์บันทึก | `/cgi-bin/mediaFileFind.cgi` (factory.create → findFile → findNextFile → close) |
| เล่นย้อนหลังจาก NVR | `rtsp://host:554/cam/playback?channel=N&starttime=YYYY_MM_DD_HH_MM_SS&endtime=...` |
| เหตุการณ์ | `/cgi-bin/eventManager.cgi?action=attach&codes=[All]&heartbeat=5` (stream ต่อเนื่องแบบ multipart) |
| PTZ | `/cgi-bin/ptz.cgi?action=start&channel=N&code=Left...` |

ตัวอย่างรหัสเหตุการณ์ที่ต้องแปลง: `VideoMotion`, `CrossLineDetection`, `CrossRegionDetection`, `SmartMotionHuman`, `SmartMotionVehicle`, `FaceDetection`, `VideoLoss`, `VideoBlind`, `StorageFailure`

**แหล่งอ้างอิงบน GitHub/PyPI ที่สำรวจแล้ว**

| โปรเจค | ลักษณะ | วิธีใช้กับเรา |
|---|---|---|
| [rroller/dahua](https://github.com/rroller/dahua) (Home Assistant integration) | client HTTP API ที่ครอบคลุมมาก มี event stream และรองรับ firmware หลายรุ่น | **ใช้เป็นแหล่งอ้างอิงหลัก** ว่าเรียก endpoint และ parse event อย่างไร |
| [aiodahua (PyPI)](https://pypi.org/project/aiodahua/) | async client ที่แยกออกมาจาก integration ข้างบน (89 methods) | ทดลองใช้ได้ แต่ต้องตรวจ license และความต่อเนื่องของโปรเจคก่อน |
| [python-amcrest](https://github.com/tchellomello/python-amcrest) | client ที่เก่าและเป็นที่รู้จัก ใช้กับ Dahua ได้ | **GPL-2.0**: ถ้านำไปรวมในผลิตภัณฑ์เชิงพาณิชย์จะติดเงื่อนไข GPL ใช้เป็นแหล่งอ้างอิงเท่านั้น |
| Dahua NetSDK (Python) | SDK ทางการ (C library + Python wrapper) | ทางสำรองสำหรับความสามารถที่ HTTP API ไม่มี ต้องขอจาก Dahua partner |
| [OpenDahua](https://github.com/Tijn0/OpenDahua) | ใช้ protocol P2P เฉพาะของ Dahua | ไม่แนะนำสำหรับงานนี้ |

**ข้อแนะนำ:** เขียน `DahuaDriver` เป็นของเราเองแบบบางๆ ด้วย httpx (ประมาณ 1–2 พันบรรทัด) โดยอ้างอิงจาก rroller/dahua และเอกสาร **Dahua HTTP API ฉบับทางการ** (ขอได้จากตัวแทนจำหน่ายหรือ Dahua partner portal) วิธีนี้ทำให้เราเป็นเจ้าของโค้ดเต็มที่ ไม่ติดปัญหา license และแก้ปัญหา firmware ได้เอง

### 3.2 ยี่ห้ออื่น (เฟสถัดไป)

| ยี่ห้อ | API | หมายเหตุ |
|---|---|---|
| Hikvision | **ISAPI** (`/ISAPI/...`, XML) + event stream `/ISAPI/Event/notification/alertStream` | มีเอกสารและตัวอย่างเยอะ, อ้างอิง pyHik ได้ |
| Uniview | **LAPI** (`/LAPI/V1.0/...`, JSON, Digest auth) | แทบไม่มีไลบรารีบน GitHub ต้องขอเอกสาร LAPI จาก Uniview โดยตรง |
| อื่นๆ | **ONVIF** Profile S (ภาพสด), G (ย้อนหลัง), T (เหตุการณ์ PullPoint) | ใช้เป็นทางเลือกสุดท้ายสำหรับยี่ห้อที่ไม่มี Driver เฉพาะ แต่ AI event ผ่าน ONVIF จะได้ไม่ครบเท่า API ของผู้ผลิต |

---

## 4. การจัดการวิดีโอ

### 4.1 ภาพสด
- MediaMTX ดึง RTSP จากกล้อง/NVR **เฉพาะเมื่อมีคนดู** (`sourceOnDemand`) เพื่อประหยัดแบนด์วิดท์
- หน้าจอแบ่งช่องใช้ **sub-stream** (เช่น 640×360–D1) ส่วนการดูเต็มจอสลับเป็น **main-stream** ให้อัตโนมัติ
- ส่งภาพให้เบราว์เซอร์ด้วย **WebRTC (WHEP)** ซึ่ง latency ต่ำกว่า 1 วินาที และใช้ **HLS** เป็นทางสำรอง
- ⚠️ **ตั้ง sub-stream ของกล้องทุกตัวเป็น H.264** เพราะเบราว์เซอร์ยังรองรับ H.265 ผ่าน WebRTC ได้ไม่ทุกเครื่อง ส่วน main-stream ใช้ H.265 สำหรับบันทึกได้
- จำกัดจำนวนช่องต่อหน้าจอไว้ที่ 36 ช่อง เพราะเครื่องผู้ใช้ทั่วไปถอดรหัสภาพหลายสิบช่องพร้อมกันไม่ไหว

### 4.2 Layout และ Drag & Drop
- ด้านซ้ายแสดงต้นไม้กล้อง (สถานที่ → NVR → กล้อง) ลากกล้องไปวางที่ช่องใดก็ได้
- Layout เตรียมไว้ให้: 1, 4, 9, 16, 25, 36 และแบบ 1 ช่องใหญ่ + 5 ช่องเล็ก (1+5) หรือ 1+7
- บันทึก Layout ตั้งชื่อเป็นภาษาไทยได้ (เช่น "ตลาดสด", "หน้าสำนักงาน") เก็บแยกต่อผู้ใช้ หรือแชร์ทั้งหน่วยงาน
- ส่งออก/นำเข้า Layout เป็นไฟล์ `.json` ได้
- ปุ่มถ่ายภาพ (snapshot) บันทึกเป็น `.jpg` พร้อมชื่อกล้องและเวลาในชื่อไฟล์

### 4.3 การบันทึกบนเซิร์ฟเวอร์
- MediaMTX บันทึกเป็น **fMP4 segment** ทีละ 1 ชั่วโมงหรือน้อยกว่า โดยไม่ transcode (copy stream) จึงใช้ CPU ต่ำ
- กำหนดนโยบายได้ต่อกล้อง: `ต่อเนื่อง` / `เฉพาะเหตุการณ์` / `ไม่บันทึก` และเลือกได้ว่าบันทึก main หรือ sub stream
- Retention Job ลบไฟล์เก่าตามจำนวนวันที่ตั้งไว้ และเมื่อดิสก์ใกล้เต็ม
- ออกแบบ Recorder Node ให้ **เพิ่มเครื่องได้** (เช่น 1 เครื่องต่อ 64–128 กล้อง) ตั้งแต่แรก

**⚠️ ประเมินพื้นที่จัดเก็บ (สำคัญมาก)**

| สถานการณ์ (256 กล้อง) | บิตเรตเฉลี่ย | ต่อวัน | 30 วัน |
|---|---|---|---|
| Main stream H.264 ต่อเนื่อง | 4 Mbps | ~11 TB | ~330 TB |
| Main stream H.265 ต่อเนื่อง | 2 Mbps | ~5.5 TB | ~165 TB |
| Sub stream ต่อเนื่อง | 0.5 Mbps | ~1.4 TB | ~41 TB |

**ข้อเสนอ:** ให้ NVR เป็นที่เก็บหลักแบบความละเอียดเต็ม ส่วนเซิร์ฟเวอร์บันทึก **sub-stream ต่อเนื่อง** และ **main-stream เฉพาะช่วงเหตุการณ์และกล้องสำคัญ** ระบบย้อนหลังจะดึงจาก NVR เมื่อต้องการความละเอียดเต็ม วิธีนี้ลดต้นทุนฮาร์ดแวร์ได้มาก

### 4.4 การดูย้อนหลัง
- หน้าจอเดียว: เลือกกล้อง → เลือกวันที่ → Timeline 24 ชั่วโมง (แถบสีแยกประเภทการบันทึก/เหตุการณ์)
- **แหล่งข้อมูล:** ระบบเลือกให้อัตโนมัติ (ใช้เซิร์ฟเวอร์ก่อน ถ้าไม่มีจึงดึงจาก NVR) และผู้ใช้ขั้นสูงเลือกเองได้
- จากเซิร์ฟเวอร์: ใช้ MediaMTX playback server (`/list`, `/get?path=&start=&duration=`)
- จาก NVR: API สร้าง RTSP playback URL ผ่าน Driver แล้วให้ MediaMTX เปิดเป็น path ชั่วคราวและส่งเป็น WebRTC
- ควบคุมการเล่น: เล่น/หยุด, ×1/×2/×4/×8, ถอยหลัง 10 วินาที, ส่งออกคลิป `.mp4` (บันทึก audit ทุกครั้ง)
- ดูย้อนหลังพร้อมกันได้ 4 กล้อง (sync เวลา) ในเฟสหลัง

---

## 5. ระบบแจ้งเตือน

```
กล้อง/NVR ──event stream──► Device Worker ──normalize──► Redis Stream
                                                     │
                                     Event Processor ─┤─ กรองซ้ำ (dedup กล้อง vs NVR)
                                                     ├─ ใช้กฎ: ช่วงเวลา, ระดับความสำคัญ
                                                     ├─ ถ่าย snapshot / mark การบันทึก
                                                     ├─ บันทึกลง PostgreSQL
                                                     └─ ส่งไป WebSocket → หน้าจอ (เสียง + popup)
```

- **Motion พื้นฐาน:** ปิดไว้เป็นค่าเริ่มต้น หรือกรองให้เหลือเฉพาะช่วงเวลา เพราะเกิดบ่อยมากและทำให้ผู้ใช้ "ชินกับเสียงเตือนจนไม่สนใจ"
- **AI จากกล้อง:** รับผ่าน event stream ของกล้องโดยตรง
- **AI จาก NVR:** รับผ่าน event stream ของ NVR ซึ่งระบุหมายเลข channel ระบบจะแมป channel กลับเป็นกล้อง
- **Dedup:** ถ้ากล้องและ NVR ส่งเหตุการณ์เดียวกันภายใน N วินาที ให้รวมเป็นรายการเดียว
- **ศูนย์แจ้งเตือน:** รายการเหตุการณ์พร้อมภาพ snapshot มีปุ่ม "ดูภาพสด", "ดูย้อนหลัง 30 วินาที" และ "รับทราบ/ปิดเรื่อง" พร้อมช่องหมายเหตุ
- **ช่องทางภายนอก (เฟสหลัง):** Telegram, LINE Messaging API (LINE Notify ปิดบริการไปแล้ว), Email

---

## 6. ออกแบบเพื่อผู้ใช้ที่ไม่ใช่ผู้เชี่ยวชาญ

| หลักการ | การนำไปใช้ |
|---|---|
| ภาษาไทยทั้งระบบ | ไม่ใช้คำว่า channel/stream/RTSP บนหน้าจอผู้ใช้ทั่วไป ใช้คำว่า "กล้อง", "ภาพคมชัด/ภาพประหยัด" แทน |
| 2 โหมด | **ผู้ใช้งาน** (ดูภาพ ย้อนหลัง แจ้งเตือน) และ **ผู้ดูแลระบบ** (เพิ่มอุปกรณ์ ตั้งค่า) |
| ตัวช่วยเพิ่มอุปกรณ์ (Wizard) | กรอก IP + user + password → ระบบตรวจยี่ห้อและดึงรายการกล้องทั้งหมดจาก NVR ให้อัตโนมัติ, มีปุ่มค้นหาอุปกรณ์ในเครือข่าย (ONVIF discovery) |
| ชื่อและสถานที่ | ตั้งชื่อกล้องตามสถานที่จริง ("แยกหน้าวัด ฝั่งเหนือ") จัดกลุ่มตามโซน |
| สถานะชัดเจน | ไฟเขียว/แดงที่กล้องทุกตัว ถ้าภาพหายให้แสดงข้อความว่า "กล้องออฟไลน์ ติดต่อผู้ดูแล" ไม่ใช่ error code |
| ทำงานด้วยคลิกน้อย | ส่งออกคลิปได้ใน 3 คลิก: เลือกช่วงบน timeline → ส่งออก → ดาวน์โหลด |
| ปุ่มใหญ่ ตัวอักษรใหญ่ | รองรับจอ TV/Video wall ในห้องควบคุม |
| คู่มือในตัว | มีปุ่ม "?" ทุกหน้า และวิดีโอสอนสั้นๆ |

---

## 7. ความปลอดภัยและ PDPA

ภาพจากกล้องวงจรปิดเป็น **ข้อมูลส่วนบุคคล** ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) และเทศบาลเป็นหน่วยงานรัฐ ระบบจึงต้องมีสิ่งต่อไปนี้
- **RBAC:** ผู้ดูแลระบบ / หัวหน้า / เจ้าหน้าที่ / ผู้ดูอย่างเดียว และกำหนดได้ว่าใครเห็นกล้องโซนไหน
- **Audit log ที่แก้ไขไม่ได้:** บันทึกการ login, ดูย้อนหลัง, ส่งออกคลิป และแก้ไขการตั้งค่า
- **รหัสผ่านอุปกรณ์เข้ารหัส** ในฐานข้อมูล (Fernet/AES) และไม่แสดงบนหน้าจอ
- HTTPS ทั้งระบบ, ล็อกบัญชีเมื่อใส่รหัสผิดซ้ำ, เพิ่ม 2FA สำหรับผู้ดูแลในเฟสหลัง
- **แยกเครือข่าย:** กล้องอยู่ VLAN ของตัวเอง ให้เฉพาะเซิร์ฟเวอร์เข้าถึงได้ และผู้ใช้ไม่ต่อกล้องโดยตรง
- กำหนดระยะเวลาเก็บข้อมูล (retention) ให้สอดคล้องกับนโยบายของหน่วยงาน

---

## 8. การดูแลระบบ (Operations)

- Health monitor: สถานะกล้อง/NVR online/offline, HDD ของ NVR, พื้นที่ดิสก์ของเซิร์ฟเวอร์ และแจ้งเตือนเมื่อผิดปกติ
- Log แบบมีโครงสร้าง (JSON) และ metrics (Prometheus + Grafana ในเฟสหลัง)
- สำรองฐานข้อมูลอัตโนมัติรายวัน
- อัปเดตเวอร์ชันด้วย `docker compose pull && up -d` พร้อม migration อัตโนมัติ
- ระบบ License/รหัสเปิดใช้งาน สำหรับขายให้หลายเทศบาล (เฟสหลัง)

---

## 9. ข้อมูลหลัก (Data Model เบื้องต้น)

```
Site (สถานที่/เทศบาล) ─┬─ Zone (โซน)
                       └─ Device (NVR หรือกล้องเดี่ยว: vendor, host, port, credentials, status)
                              └─ Camera (channel, ชื่อ, zone, stream urls, recording policy, ai capabilities)
User ─ Role ─ Permission (ต่อ Zone/Camera)
Layout (owner, shared, grid definition JSON)
Recording (camera, start, end, path, size, source=server)
Event (camera, device, type, severity, time, snapshot, payload JSONB, ack_by, ack_at, note)
AuditLog (user, action, target, time, ip)
```

---

## 10. ฮาร์ดแวร์แนะนำสำหรับการทดลอง (256 กล้อง)

| เครื่อง | สเปกเบื้องต้น |
|---|---|
| App Server (API + DB + Redis) | 8 core, 32 GB RAM, SSD 1 TB |
| Media/Recorder Server (×2, เครื่องละ 128 กล้อง) | 16 core, 64 GB RAM, **10 GbE**, ดิสก์ตามที่คำนวณในข้อ 4.3 (RAID 6) |
| เครื่องผู้ใช้ (ห้องควบคุม) | CPU รุ่นใหม่ + GPU ที่ถอดรหัสภาพด้วยฮาร์ดแวร์ได้, Chrome/Edge |

> ตัวเลขนี้ต้องยืนยันด้วย load test ในเฟส 4
