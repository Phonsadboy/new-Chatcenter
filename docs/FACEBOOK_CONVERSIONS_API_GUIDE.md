# 📊 คู่มือการตั้งค่า Facebook Conversions API (CAPI) สำหรับ ChatCenterAI

> อัปเดตล่าสุด: ธันวาคม 2024

---

## 📌 สารบัญ

1. [บทนำ: Facebook Conversions API คืออะไร?](#-บทนำ-facebook-conversions-api-คืออะไร)
2. [ประโยชน์ที่ได้รับ](#-ประโยชน์ที่ได้รับ)
3. [ข้อกำหนดเบื้องต้น](#-ข้อกำหนดเบื้องต้น)
4. [ขั้นตอนการตั้งค่า](#-ขั้นตอนการตั้งค่า)
5. [การทำงานของระบบ](#-การทำงานของระบบ)
6. [การตรวจสอบและทดสอบ](#-การตรวจสอบและทดสอบ)
7. [FAQ คำถามที่พบบ่อย](#-faq-คำถามที่พบบ่อย)
8. [การแก้ไขปัญหา (Troubleshooting)](#-การแก้ไขปัญหา-troubleshooting)

---

## 📘 บทนำ: Facebook Conversions API คืออะไร?

**Facebook Conversions API (CAPI)** เป็นเครื่องมือที่ช่วยให้คุณส่งข้อมูล "Conversion Events" (เหตุการณ์การแปลง) เช่น การซื้อสินค้า จากเซิร์ฟเวอร์ของคุณไปยัง Facebook โดยตรง

### 🔄 ความแตกต่างจาก Facebook Pixel

| คุณสมบัติ | Facebook Pixel | Conversions API (CAPI) |
|-----------|----------------|------------------------|
| **การทำงาน** | ทำงานบน Browser ของลูกค้า | ทำงานบน Server ของคุณ |
| **ข้อจำกัด** | ถูกบล็อกโดย Ad Blockers, iOS 14.5+ | ไม่ถูกบล็อก |
| **ความแม่นยำ** | อาจพลาดการติดตาม 30-40% | ติดตามได้เกือบ 100% |
| **ความเหมาะสม** | Website ทั่วไป | Chat-based Commerce, Business Messaging |

### 💬 สำหรับ ChatCenterAI

ChatCenterAI ใช้ **Business Messaging** ผ่าน Facebook Messenger ดังนั้น **CAPI คือวิธีเดียวที่เหมาะสม** ในการส่งข้อมูลการซื้อไปยัง Facebook Ads เนื่องจาก:

- ลูกค้าสั่งซื้อผ่าน Chat ไม่ใช่บน Website
- ไม่มี Browser ให้ติดตั้ง Pixel
- การยืนยันคำสั่งซื้อเกิดขึ้นบน Admin Panel

---

## 🎯 ประโยชน์ที่ได้รับ

### 1. 📈 ปรับปรุงประสิทธิภาพโฆษณา

- Facebook จะเห็นว่าโฆษณาไหนสร้างยอดขายจริง
- ระบบ AI ของ Facebook จะเรียนรู้และ **กำหนดเป้าหมายได้แม่นยำขึ้น**
- ลด Cost per Acquisition (CPA) และเพิ่ม ROAS

### 2. 🔍 ข้อมูลการวิเคราะห์ที่สมบูรณ์

- เห็น Conversion ใน Facebook Ads Manager
- คำนวณ ROI ได้ถูกต้อง
- เปรียบเทียบประสิทธิภาพแคมเปญได้แม่นยำ

### 3. 🚀 Compatible กับ iOS 14.5+

- ไม่ได้รับผลกระทบจาก App Tracking Transparency (ATT)
- ติดตามผู้ใช้ iPhone ได้ตามปกติ

---

## ✅ ข้อกำหนดเบื้องต้น

ก่อนเริ่มตั้งค่า ตรวจสอบว่าคุณมีสิ่งต่อไปนี้:

| ข้อกำหนด | รายละเอียด |
|----------|------------|
| ✅ Facebook Business Manager | บัญชี Business ที่เข้าถึง Page และ Ads ได้ |
| ✅ Facebook Page | Page ที่เชื่อมต่อกับ ChatCenterAI แล้ว |
| ✅ Page Access Token | Token ที่มี permission `pages_events` |
| ✅ Dataset ID | ได้จาก Events Manager (ขั้นตอนด้านล่าง) |

---

## 📝 ขั้นตอนการตั้งค่า

### ขั้นตอนที่ 1: เข้าถึง Facebook Events Manager

1. ไปที่ [Facebook Events Manager](https://business.facebook.com/events_manager)
2. เลือก **Business Account** ที่ถูกต้อง (มุมขวาบน)

![Events Manager](/docs/images/events-manager-home.png)

### ขั้นตอนที่ 2: สร้างหรือเลือก Data Source (Dataset)

#### กรณี: สร้าง Data Source ใหม่

1. คลิก **"Connect data sources"** (เชื่อมต่อแหล่งข้อมูล)
2. เลือก **"Conversions API"**
3. ตั้งชื่อ Dataset เช่น `ChatCenterAI - [ชื่อ Page]`
4. คลิก **Create**

#### กรณี: ใช้ Data Source ที่มีอยู่

1. เลือก Data Source ที่เกี่ยวข้องจากเมนูซ้าย
2. ตรวจสอบว่าเป็นประเภท "Conversions API" หรือ "Web"

### ขั้นตอนที่ 3: ค้นหา Dataset ID

1. เลือก Data Source ที่ต้องการ
2. ไปที่แท็บ **"Settings"** (การตั้งค่า)
3. มองหา **"Dataset ID"** ในส่วน Overview

```
📋 Dataset ID มักจะเป็นตัวเลข 15-16 หลัก เช่น: 1234567890123456
```

> **💡 เคล็ดลับ:** Dataset ID เหมือนกับ Pixel ID! ถ้าคุณมี Pixel อยู่แล้ว สามารถใช้ ID เดียวกันได้

### ขั้นตอนที่ 4: ตรวจสอบ Page Access Token

Page Access Token ที่คุณใช้อยู่แล้วกับ ChatCenterAI ควรมี permission ที่จำเป็น:

#### Permission ที่ต้องมี:
- `pages_messaging` - สำหรับส่งข้อความ (มีอยู่แล้ว)
- `pages_events` - **สำหรับส่ง Conversion Events**

#### วิธีตรวจสอบ Permission:

1. ไปที่ [Facebook Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)
2. วาง Access Token ของคุณ
3. คลิก **Debug**
4. ตรวจสอบว่ามี `pages_events` ในรายการ Permissions

**ถ้าไม่มี `pages_events`:**
1. ไปที่ Facebook App ของคุณ
2. เมนู **Messenger** → **Settings**
3. สร้าง Access Token ใหม่ และเลือก Page ที่ต้องการ
4. ระบบจะให้ Token ที่มี permission ครบ

### ขั้นตอนที่ 5: กรอก Dataset ID ใน ChatCenterAI

1. ไปที่ **หน้าตั้งค่า** ของ ChatCenterAI
2. เลือก **Facebook Bots** หรือคลิก **Edit** บน Facebook Bot ที่ต้องการ
3. มองหาช่อง **"Dataset ID (Conversions API)"**
4. กรอก Dataset ID ที่ได้จากขั้นตอนที่ 3

```
📝 ตัวอย่าง:
Dataset ID: 1234567890123456
```

5. คลิก **บันทึก**

---

## ⚙️ การทำงานของระบบ

### 🔄 Flow การส่งข้อมูล

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ChatCenterAI System                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. ลูกค้าสั่งซื้อผ่าน Messenger                                      │
│         ↓                                                           │
│  2. AI สกัดออเดอร์อัตโนมัติ หรือ Admin สร้างออเดอร์                      │
│         ↓                                                           │
│  3. Admin เปลี่ยนสถานะเป็น "ยืนยันแล้ว" (Confirmed) ✅                  │
│         ↓                                                           │
│  4. ระบบตรวจสอบ:                                                     │
│     - เป็นออเดอร์จาก Facebook? ✓                                     │
│     - มี Dataset ID ตั้งค่าไว้? ✓                                     │
│     - ยังไม่เคยส่ง Conversion? ✓                                      │
│         ↓                                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  5. ส่ง Purchase Event ไป Facebook Conversions API          │    │
│  │                                                             │    │
│  │  Payload:                                                   │    │
│  │  {                                                          │    │
│  │    event_name: "Purchase",                                  │    │
│  │    event_time: 1702123456,                                  │    │
│  │    action_source: "business_messaging",                     │    │
│  │    messaging_channel: "messenger",                          │    │
│  │    user_data: {                                             │    │
│  │      page_id: "123456789",                                  │    │
│  │      page_scoped_user_id: "PSID_ของลูกค้า"                   │    │
│  │    },                                                       │    │
│  │    custom_data: {                                           │    │
│  │      currency: "THB",                                       │    │
│  │      value: 1500                                            │    │
│  │    }                                                        │    │
│  │  }                                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│         ↓                                                           │
│  6. Facebook รับข้อมูลและบันทึก Conversion                            │
│         ↓                                                           │
│  7. ระบบบันทึกสถานะว่าส่งสำเร็จแล้ว                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 📊 ข้อมูลที่ส่งไป Facebook

| Field | คำอธิบาย | ตัวอย่าง |
|-------|----------|----------|
| `event_name` | ประเภท Event | `"Purchase"` |
| `event_time` | เวลาที่เกิด Event (Unix timestamp) | `1702123456` |
| `action_source` | แหล่งที่มา | `"business_messaging"` |
| `messaging_channel` | ช่องทาง | `"messenger"` |
| `page_id` | ID ของ Facebook Page | `"123456789012345"` |
| `page_scoped_user_id` | ID ของลูกค้า (PSID) | `"9876543210"` |
| `currency` | สกุลเงิน | `"THB"` |
| `value` | มูลค่าออเดอร์ | `1500` |

### 🧮 การคำนวณมูลค่าออเดอร์

ระบบจะคำนวณ `value` โดย:

1. ถ้ามี `totalAmount` → ใช้ค่านี้
2. ถ้าไม่มี → รวม `(ราคา × จำนวน)` ของทุกสินค้า
3. บวกค่าจัดส่ง (`shippingCost`) ถ้ามี

---

## 🔍 การตรวจสอบและทดสอบ

### ทดสอบใน Test Events (แนะนำ)

1. ไปที่ [Events Manager](https://business.facebook.com/events_manager)
2. เลือก Data Source ของคุณ
3. ไปที่แท็บ **"Test Events"**
4. สร้างออเดอร์ทดสอบใน ChatCenterAI และยืนยัน
5. รอ 1-5 นาที และตรวจสอบว่า Event ปรากฏ

### ตรวจสอบใน Events Manager

1. ไปที่แท็บ **"Overview"**
2. มองหา **"Purchase"** ในรายการ Events
3. ตรวจสอบ:
   - จำนวน Events
   - มูลค่ารวม
   - Match Quality Score

### ตรวจสอบใน ChatCenterAI

เมื่อยืนยันออเดอร์ ระบบจะแสดงข้อความใน Console:

```
✅ สำเร็จ:
[FB Conversions API] ส่ง Purchase event สำเร็จสำหรับออเดอร์ 6571234567890abcdef

❌ ไม่สำเร็จ:
[FB Conversions API] ส่ง Purchase event ไม่สำเร็จ: Dataset ID not configured for this bot
```

---

## ❓ FAQ คำถามที่พบบ่อย

### Q: ต้องส่ง Conversion ทันทีหรือไม่?

**A:** ไม่ ระบบจะส่งเมื่อคุณเปลี่ยนสถานะออเดอร์เป็น **"ยืนยันแล้ว" (Confirmed)** เท่านั้น

---

### Q: ถ้าไม่กรอก Dataset ID จะเกิดอะไร?

**A:** ระบบจะ**ไม่ส่ง** Conversion Event ใดๆ ไป Facebook โฆษณายังทำงานได้ปกติ แต่จะไม่สามารถวัดผล Conversion ได้

---

### Q: มีค่าใช้จ่ายเพิ่มเติมหรือไม่?

**A:** **ไม่มี** Facebook Conversions API ใช้งานได้ฟรี

---

### Q: ต้องใช้ร่วมกับ Facebook Pixel หรือไม่?

**A:** **ไม่จำเป็น** สำหรับ Chat-based Commerce เช่น ChatCenterAI ที่ไม่มี Website ให้ติดตั้ง Pixel

---

### Q: ข้อมูลใดบ้างที่ Facebook ได้รับ?

**A:** Facebook ได้รับเฉพาะ:
- Page ID และ Page-Scoped User ID (PSID)
- ประเภท Event (Purchase)
- มูลค่าและสกุลเงิน
- เวลาที่เกิด Event

**ไม่ได้รับ:** ชื่อลูกค้า, ที่อยู่, เบอร์โทร, รายละเอียดสินค้า

---

### Q: ถ้ายืนยันออเดอร์ซ้ำจะส่งซ้ำหรือไม่?

**A:** **ไม่** ระบบจะบันทึกว่าส่ง Conversion แล้ว (`fbConversionSent: true`) และจะไม่ส่งซ้ำ

---

### Q: รองรับ Events อื่นนอกจาก Purchase หรือไม่?

**A:** ปัจจุบันระบบส่งเฉพาะ **Purchase Event** ซึ่งเป็น Event ที่สำคัญที่สุดสำหรับ E-commerce

---

## 🔧 การแก้ไขปัญหา (Troubleshooting)

### ปัญหา: "Dataset ID not configured for this bot"

**สาเหตุ:** ไม่ได้กรอก Dataset ID ในการตั้งค่า Facebook Bot

**วิธีแก้:**
1. ไปที่ **ตั้งค่า** → **Facebook Bots**
2. กด **Edit** บน Bot ที่ต้องการ
3. กรอก Dataset ID ในช่อง "Dataset ID (Conversions API)"
4. คลิก **บันทึก**

---

### ปัญหา: "Missing required parameters"

**สาเหตุ:** ข้อมูลบางอย่างขาดหายไป (datasetId, accessToken, pageId, หรือ psid)

**วิธีแก้:**
1. ตรวจสอบว่า Facebook Bot มีข้อมูลครบ:
   - Page ID
   - Page Access Token  
   - Dataset ID
2. ตรวจสอบว่าออเดอร์มี `userId` ที่ถูกต้อง

---

### ปัญหา: "OAuthException" หรือ "Invalid access token"

**สาเหตุ:** Access Token หมดอายุหรือไม่มี permission

**วิธีแก้:**
1. ไปที่ Facebook App ของคุณ
2. สร้าง Access Token ใหม่
3. ตรวจสอบว่ามี permission `pages_events`
4. อัปเดต Token ใน ChatCenterAI

---

### ปัญหา: Event ไม่ปรากฏใน Events Manager

**สาเหตุที่เป็นไปได้:**
1. ยังไม่ถึง 5 นาที (รอข้อมูลประมวลผล)
2. Dataset ID ไม่ตรงกับที่ดูใน Events Manager
3. Event ถูกกรองออกโดยตัวกรองวันที่

**วิธีแก้:**
1. รอ 5-10 นาที
2. ตรวจสอบ Dataset ID ให้ตรงกัน
3. ปรับตัวกรองวันที่ใน Events Manager เป็น "Today" หรือ "Last 7 days"
4. ใช้แท็บ "Test Events" เพื่อดู Real-time

---

### ปัญหา: Match Quality ต่ำ

**สาเหตุ:** ข้อมูล User ที่ส่งไปมีน้อยเกินไป

**หมายเหตุ:** สำหรับ Business Messaging ผ่าน Messenger, Facebook ใช้ PSID ในการจับคู่ ซึ่งมีความแม่นยำสูงอยู่แล้ว ไม่ต้องกังวลเรื่อง Match Quality มากนัก

---

## 📚 แหล่งข้อมูลเพิ่มเติม

- [Facebook Conversions API for Business Messaging - Official Docs](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging)
- [Events Manager](https://business.facebook.com/events_manager)
- [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)

---

## 📞 ติดต่อสอบถาม

หากพบปัญหาหรือต้องการความช่วยเหลือเพิ่มเติม สามารถติดต่อทีมพัฒนา ChatCenterAI ได้ตามช่องทางที่ให้ไว้

---

> 📝 **หมายเหตุ:** คู่มือนี้อ้างอิงจากเอกสาร Facebook Conversions API อย่างเป็นทางการ อัปเดตล่าสุด ธันวาคม 2024 อาจมีการเปลี่ยนแปลงในอนาคต กรุณาตรวจสอบเอกสารอย่างเป็นทางการของ Facebook ด้วย
