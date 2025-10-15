import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 تحميل المتغيرات البيئية
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
const RADIUS = Number(process.env.RADIUS || 50);
const RESTAURANT_LAT = Number(process.env.RESTAURANT_LAT);
const RESTAURANT_LON = Number(process.env.RESTAURANT_LON);

// 🔐 إعداد المصادقة عبر JWT
const serviceAccountAuth = new JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// 📄 دالة للوصول إلى الشيت
async function accessSheet() {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.loadHeaderRow();
  return sheet;
}

// 🔹 دالة لحساب المسافة بالمتر بين نقطتين
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // نصف قطر الأرض بالمتر
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 🕒 API لتسجيل الدخول والخروج
app.post("/attendance", async (req, res) => {
  try {
    const { name, mode, lat, lon } = req.body;

    if (!name || !mode || lat === undefined || lon === undefined)
      return res.status(400).json({ message: "❌ الرجاء إدخال الاسم والوضع والموقع." });

    // 🔹 التحقق من الموقع
    const distance = getDistance(lat, lon, RESTAURANT_LAT, RESTAURANT_LON);
    if (distance > RADIUS) return res.json({ message: "❌ أنت لست داخل المطعم." });

    const sheet = await accessSheet();
    const rows = await sheet.getRows();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const timeNow = now.toTimeString().slice(0, 8);

    if (mode === "in") {
      // البحث عن أي صف مفتوح لنفس الاسم
      const openRow = rows
        .filter(r => r.name?.trim().toLowerCase() === name.trim().toLowerCase())
        .find(r => !r.out_time);

      if (openRow) return res.json({ message: "✅ تم تسجيل دخولك مسبقاً اليوم." });

      await sheet.addRow({ name, date: today, in_time: timeNow, out_time: "", work_duration: "" });
      return res.json({ message: "✅ تم تسجيل دخولك بنجاح." });
    }

    if (mode === "out") {
      // البحث عن آخر صف مفتوح لنفس الاسم
      const openRow = rows
        .filter(r => r.name?.trim().toLowerCase() === name.trim().toLowerCase())
        .reverse()
        .find(r => !r.out_time);

      if (!openRow) return res.json({ message: "⚠️ لم تسجل دخولك مسبقاً." });

      openRow.out_time = timeNow;

      // حساب مدة العمل
      if (openRow.in_time) {
        const [hIn, mIn] = openRow.in_time.split(":").map(Number);
        const [hOut, mOut] = timeNow.split(":").map(Number);
        const duration = ((hOut * 60 + mOut) - (hIn * 60 + mIn)) / 60;
        openRow.work_duration = duration.toFixed(2) + " ساعة";
      }

      await openRow.save();
      return res.json({ message: "👋 تم تسجيل خروجك رافقتك السلامة." });
    }

    res.json({ message: "❌ وضع غير معروف." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ حدث خطأ في السيرفر." });
  }
});

// 🔹 فحص سريع للسيرفر
app.get("/", (req, res) => res.send("✅ Attendance Server Running..."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
