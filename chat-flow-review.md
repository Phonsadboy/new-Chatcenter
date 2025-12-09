# รายงานตรวจสอบ flow การตอบแชท (Facebook Page)

## Flow ที่ครอบคลุม
- เพิ่ม Facebook App ผ่าน `/api/facebook-apps` เพื่อได้ `webhookUrl` (`/webhook/fb/:appId`) และ `verifyToken` สำหรับตั้งค่าใน Facebook Developer Dashboard.
- เชื่อม Page ด้วยการสร้าง Facebook Bot (`/api/facebook-bots`) ที่เก็บ `pageId` และ `page access token` ผูกกับ App.
- รับเหตุการณ์ผ่าน webhook `/webhook/fb/:appId` (multi-page) หรือ `/webhook/facebook/:botId` (legacy) แล้วค้นหา Bot ตาม `pageId`.
- จัดคิวข้อความใน `addToQueue` → `processFlushedMessages` เพื่อสร้าง system prompt, เรียก OpenAI และบันทึกประวัติแชท.
- ส่งข้อความกลับผู้ใช้ผ่าน Graph API ใน `sendFacebookMessage`.

## ประเด็นที่พบ (เรียงตามความรุนแรง)
- **OpenAI key ถูกเรียกด้วย field ผิด (`apiKeyToUse.key`) ทำให้คีย์ที่เซ็ตไว้ไม่ถูกใช้จริงและล็อกการตอบคอมเมนต์เสีย**  
  - `getOpenAIApiKeyForBot` คืนค่าชื่อ field `apiKey`/`keyId` (`index.js:19348`) แต่ที่จุดเรียกใช้ใช้ `apiKeyToUse.key` และตรวจ `if (!apiKeyToUse.key)` (`index.js:6151`, `index.js:8020`, `index.js:8230`). ผลลัพธ์คือระบบมองว่า “ไม่มีคีย์” ทั้งที่มีคีย์ในฐานข้อมูลหรือ `.env` ทำให้การตอบคอมเมนต์และการส่งงานให้ OpenAI ใช้คีย์ผิด/ไม่มีคีย์ และการบันทึก usage ใช้ `apiKeyToUse.id` ที่ไม่มีอยู่จริง.
  - ผลกระทบ: การตอบอัตโนมัติ (โดยเฉพาะคอมเมนต์) จะล้มเหลวทันที, per-bot key/usage log ใช้งานไม่ได้ และ fallback ไปพึ่ง env อาจยังเป็น `undefined`.

- **ข้อความจาก webhook multi-page ไม่ถูกป้อนเข้า AI เพราะคิวไม่ได้ใส่โครงสร้าง `data.type`**  
  - ใน `/webhook/fb/:appId` เมื่อรับ messaging event จะสร้าง `chatDoc` ที่ไม่มี `data.type` แล้วส่งเข้า `addToQueue` (`index.js:10244`). `processFlushedMessages` กรองเฉพาะรายการที่มี `data.type` เป็น `text` หรือ `image`; เอกสารที่ไม่มีจะถูกทิ้ง (`filterMessagesForStrategy` / `buildContentSequenceFromMessages`).
  - ผลกระทบ: ลูกค้าที่ส่งข้อความมาทาง endpoint multi-page จะไม่ได้รับคำตอบจาก AI เลย (ข้อความถูกดรอปตั้งแต่คิว).

- **ไม่มีการตรวจสอบลายเซ็น webhook (Facebook/LINE)**  
  - LINE: `/webhook/line/:botId` ไม่มีการตรวจ `X-Line-Signature` ก่อนประมวลผล (`index.js:9911`).  
  - Facebook: `/webhook/fb/:appId` และ `/webhook/facebook/:botId` ไม่ตรวจ `X-Hub-Signature-256`, ใช้เพียง `verifyToken` ตอน GET (`index.js:9987`, `index.js:10282`).  
  - ผลกระทบ: สามารถถูกยิง webhook ปลอมเพื่อสแปมคิว/เรียก OpenAI ทำให้ค่าใช้จ่ายเพิ่มหรือข้อมูลในห้องแชทปนเปื้อน.

- **สร้าง Facebook Bot โดยไม่ตรวจว่า App มีอยู่/เปิดใช้งาน**  
  - `POST /api/facebook-bots` เช็กเพียงว่า `facebookAppId` เป็น ObjectId แต่ไม่ตรวจว่ามี App จริงหรือสถานะ active (`index.js:12088`). ถ้าใส่ ID ผิด, bot จะบันทึกได้ แต่ webhook `/webhook/fb/:appId` จะหาเพจไม่เจอและไม่ตอบแชท.
  - ผลกระทบ: ผู้ใช้ตั้งค่าถูกฝั่งเพจแต่ระบบไม่ตอบกลับ เพราะ mapping App→Page ผิดตั้งแต่บันทึกข้อมูล.

- **ความเสี่ยงด้านความลับและการตั้งค่าเริ่มต้น**
  - มีการฝัง Google Service Account key แบบชัดเจนในโค้ด (`index.js:54-58`) ซึ่งเป็นข้อมูลลับ ไม่ควรอยู่ใน repository/production image.
  - เอกสารตั้งค่าใช้ตัวแปร `MONGODB_URI` (`README.md:58`) แต่โค้ดอ่าน `MONGO_URI` (`index.js:45`). ถ้าใช้งานตาม README จะเชื่อม MongoDB ไม่ได้ ทำให้ flow ทั้งหมดหยุดตั้งแต่เริ่ม.

## ข้อเสนอแนะสั้น ๆ
1. แก้ `getOpenAIApiKeyForBot` ให้ส่ง field ที่ผู้เรียกใช้ หรือปรับทุกจุดให้ใช้ `apiKey`/`keyId` และอัปเดตการล็อก usage ให้ถูก field.
2. ใน `/webhook/fb/:appId` แปลง messaging event เป็น `{ data: { type: "text", text } }` หรือโครงสร้างเดียวกับ legacy ก่อนส่งเข้าคิว.
3. เพิ่มการตรวจ signature (`X-Line-Signature`, `X-Hub-Signature-256`) และปฏิเสธคำขอที่ไม่ผ่านการยืนยัน.
4. เมื่อสร้าง Facebook Bot ให้ตรวจสอบการมีอยู่และสถานะของ Facebook App ก่อนบันทึก หรือบล็อกการเลือก App ที่ไม่ active ใน UI.
5. ย้าย credential (Google private key) ออกไปเป็น secret runtime และปรับเอกสารให้ใช้ตัวแปรชื่อเดียวกับที่โค้ดอ่าน (`MONGO_URI`) เพื่อป้องกันการตั้งค่าผิด.
