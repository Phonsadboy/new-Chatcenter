# 📋 รายการแก้ไขระบบ ChatCenterAI
## Approved Fixes - รายการที่ต้องแก้ไข

**วันที่สร้าง:** 10 ธันวาคม 2567  
**สถานะ:** ✅ ตัดสินใจเรียบร้อย - พร้อมดำเนินการ

---

## 📊 สรุป

| รวมที่ต้องแก้ไข | 2 ข้อ |
|----------------|-------|
| 🔴 Critical | 0 |
| 🟡 Medium | 2 |

> ✅ **แก้ไขเสร็จแล้ว:**
> - ข้อ 1 OpenAI Key ใช้ field ผิด (เปลี่ยน .key → .apiKey, .id → .keyId)
> - ข้อ 2 Webhook Multi-page ไม่ส่งข้อมูลเข้า AI (เพิ่ม data.type ใน chatDoc)
> - ข้อ 3 Google SA Key ฝังในโค้ด (ลบออกจาก index.js และ config.js)
> - ข้อ 4 README ใช้ตัวแปรผิด (เปลี่ยน MONGODB_URI → MONGO_URI)
> - ข้อ 6 ไม่ Validate Token (เพิ่มปุ่มทดสอบการเชื่อมต่อ + API endpoint)

---

## ✅ รายการที่ต้องแก้ไข (Medium Priority)

---

### 5. สร้าง Bot ไม่ตรวจ App ว่ามีอยู่จริง
| รายละเอียด | |
|------------|---|
| **ปัญหา** | สร้าง Facebook Bot โดยไม่ตรวจว่า App มีอยู่/เปิดใช้งาน |
| **ผลกระทบ** | Bot ถูกบันทึกแต่ webhook ทำงานไม่ได้ |
| **ไฟล์** | `index.js:12088` |
| **ความรุนแรง** | 🟡 Medium |
| **การตัดสินใจ** | ✅ แก้ไข |

#### 🔧 วิธีแก้ไข:

**สิ่งที่ต้องทำ:**
1. ใน `POST /api/facebook-bots` endpoint เพิ่มการตรวจสอบว่า `facebookAppId` มีอยู่จริงและ status = "active"

**ตัวอย่างโค้ดที่ต้องเพิ่ม:**
```javascript
app.post("/api/facebook-bots", async (req, res) => {
    const { facebookAppId, pageId, accessToken, name } = req.body;
    
    // ✅ เพิ่ม: ตรวจสอบว่า App มีอยู่จริงและ active
    const facebookApp = await facebookAppsColl.findOne({
        _id: new ObjectId(facebookAppId),
        status: "active"  // หรือไม่ต้องเช็ค status ถ้าไม่มี field นี้
    });
    
    if (!facebookApp) {
        return res.status(400).json({
            error: "Facebook App ไม่พบหรือไม่ได้เปิดใช้งาน"
        });
    }
    
    // ... ดำเนินการสร้าง Bot ต่อ
});
```

---

### 7. Long-Lived Token อัตโนมัติ
| รายละเอียด | |
|------------|---|
| **ปัญหา** | Page Access Token หมดอายุเร็ว (1-2 ชม.) ทำให้ระบบหยุดทำงาน |
| **ผลกระทบ** | ต้องกรอก Token ใหม่บ่อยๆ |
| **ไฟล์** | `index.js` (Facebook Bot API) |
| **ความรุนแรง** | 🟡 Medium |
| **การตัดสินใจ** | ✅ ใช้ระบบแปลง Long-Lived Token อัตโนมัติ |

#### � วิธีแก้ไข:

**แนวคิด:** เมื่อผู้ใช้กรอก Access Token (short-lived, 1-2 ชม.) ระบบจะแปลงเป็น Long-Lived Token (60 วัน) อัตโนมัติก่อนบันทึก

**สิ่งที่ต้องทำ:**

**1. บังคับให้กรอก App Secret (ปัจจุบันเป็น optional)**

แก้ไขใน `POST /api/facebook-apps`:
```javascript
// ตรวจสอบว่ากรอก appSecret
if (!appSecret) {
    return res.status(400).json({
        error: "กรุณากรอก App Secret (จำเป็นสำหรับ Long-Lived Token)"
    });
}
```

**2. เพิ่มฟังก์ชันแปลง Token ใน `index.js`:**
```javascript
async function exchangeForLongLivedToken(shortLivedToken, appId, appSecret) {
    try {
        const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: shortLivedToken
            }
        });
        
        return {
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in,  // วินาที (ประมาณ 5184000 = 60 วัน)
            expiresAt: new Date(Date.now() + (response.data.expires_in * 1000))
        };
    } catch (error) {
        console.error('Error exchanging token:', error.response?.data);
        return null;
    }
}
```

**3. แก้ไข `POST /api/facebook-bots` ให้แปลง Token ก่อนบันทึก:**
```javascript
app.post("/api/facebook-bots", async (req, res) => {
    const { facebookAppId, pageId, accessToken, name } = req.body;
    
    // ดึง App Secret จาก Facebook App
    const facebookApp = await facebookAppsColl.findOne({ _id: new ObjectId(facebookAppId) });
    
    // แปลงเป็น Long-Lived Token
    let tokenToSave = accessToken;
    let tokenExpiresAt = null;
    
    if (facebookApp?.appSecret) {
        const longLivedResult = await exchangeForLongLivedToken(
            accessToken,
            facebookApp.appId,
            facebookApp.appSecret
        );
        
        if (longLivedResult) {
            tokenToSave = longLivedResult.accessToken;
            tokenExpiresAt = longLivedResult.expiresAt;
        }
    }
    
    // บันทึกลงฐานข้อมูล
    const newBot = {
        // ... other fields
        accessToken: tokenToSave,
        tokenExpiresAt: tokenExpiresAt,  // เก็บวันหมดอายุ
    };
});
```

**4. (Optional) แสดงวันหมดอายุใน UI:**
```javascript
// แสดงใน Bot List
if (bot.tokenExpiresAt) {
    const daysLeft = Math.ceil((new Date(bot.tokenExpiresAt) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) {
        showWarning(`Token จะหมดอายุใน ${daysLeft} วัน`);
    }
}
```

---

## 🚀 ลำดับการดำเนินการ

| ลำดับ | ข้อ | ปัญหา | ความเร่งด่วน |
|------|-----|-------|-------------|
| 1 | 1 | OpenAI Key ใช้ field ผิด | 🔴 ทำทันที |
| 2 | 2 | Webhook ไม่ส่งข้อมูลเข้า AI | 🔴 ทำทันที |
| 3 | 3 | ลบ Google SA Key | 🔴 ทำทันที |
| 4 | 4 | แก้ README | 🔴 ทำทันที |
| 5 | 5 | ตรวจสอบ App ก่อนสร้าง Bot | 🟡 ทำต่อ |
| 6 | 6 | เพิ่มปุ่มทดสอบ Token | 🟡 ทำต่อ |
| 7 | 7 | Long-Lived Token อัตโนมัติ | 🟡 ทำต่อ |

---

**อัปเดตล่าสุด:** 10 ธันวาคม 2567 00:44

