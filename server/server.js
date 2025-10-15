import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const app = express();
app.use(cors());
app.use(express.json());

// 🧠 تحميل المتغيرات البيئية من Render
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

// 🔐 إعداد المصادقة عبر JWT
const serviceAccountAuth = new JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// 📄 الوصول إلى الشيت
async function accessSheet() {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  return doc.sheetsByIndex[0];
}

// 🕒 API لتسجيل الدخول والخروج
app.post("/attendance", async (req, res) => {
  try {
    const { name, mode, lat, lon } = req.body;
    if (!name || !mode)
      return res.status(400).json({ message: "❌ الرجاء إدخال الاسم والوضع." });

    const sheet = await accessSheet();
    const now = new Date();
    const today = now.toLocaleDateString("en-CA");
    const timeNow = now.toLocaleTimeString("ar-SA", { hour12: false });

    const rows = await sheet.getRows();
    const existing = rows.find(r => r.name === name && r.date === today);

    if (mode === "in") {
      if (existing) return res.json({ message: "✅ تم تسجيل دخولك مسبقاً اليوم." });

      await sheet.addRow({
        name,
        date: today,
        in_time: timeNow,
        out_time: "",
        work_duration: "",
        lat_in: lat,
        lon_in: lon
      });

      return res.json({ message: "✅ تم تسجيل دخولك بنجاح." });
    }

    if (mode === "out") {
      if (!existing) return res.json({ message: "⚠️ لم تسجل دخولك اليوم." });
      if (existing.out_time) return res.json({ message: "✅ تم تسجيل خروجك مسبقاً." });

      existing.out_time = timeNow;

      const [hIn, mIn] = existing.in_time.split(":").map(Number);
      const [hOut, mOut] = timeNow.split(":").map(Number);
      const duration = ((hOut * 60 + mOut) - (hIn * 60 + mIn)) / 60;

      existing.work_duration = duration.toFixed(2) + " ساعة";
      await existing.save();

      return res.json({ message: "👋 تم تسجيل خروجك. مدة العمل: " + existing.work_duration });
    }

    res.json({ message: "❌ وضع غير معروف." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ حدث خطأ في السيرفر." });
  }
});

// 🔍 فحص سريع
app.get("/", (req, res) => res.send("✅ Attendance Server Running..."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
