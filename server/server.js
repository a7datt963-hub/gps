import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 متغيرات البيئة
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

// 🔐 إعداد المصادقة
const serviceAccountAuth = new JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// 📄 الوصول للشيت
async function accessSheet() {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.loadHeaderRow();
  return sheet;
}

// 🕒 API تسجيل الدخول والخروج
app.post("/attendance", async (req, res) => {
  try {
    const { name, mode } = req.body;
    if (!name || !mode)
      return res.status(400).json({ message: "❌ الرجاء إدخال الاسم والوضع." });

    const sheet = await accessSheet();
    const rows = await sheet.getRows();
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeNow = now.toTimeString().slice(0, 8); // HH:MM:SS

    // 🟢 البحث عن الصف بناءً على الاسم والتاريخ
    const existing = rows.find(r => {
      const sheetName = r.name?.trim().toLowerCase() || r.Name?.trim().toLowerCase() || "";
      const sheetDate = r.date?.trim() || r.Date?.trim() || "";
      return sheetName === name.trim().toLowerCase() && sheetDate === today;
    });

    if (mode === "in") {
      if (existing) return res.json({ message: "✅ تم تسجيل دخولك مسبقاً اليوم." });

      await sheet.addRow({
        name,
        date: today,
        in_time: timeNow,
        out_time: "",
        work_duration: ""
      });
      return res.json({ message: "✅ تم تسجيل دخولك بنجاح." });
    }

    if (mode === "out") {
      if (!existing) return res.json({ message: "⚠️ لم تسجل دخولك اليوم." });
      if (existing.out_time) return res.json({ message: "✅ تم تسجيل خروجك مسبقاً." });

      existing.out_time = timeNow;

      // حساب مدة العمل
      if (existing.in_time) {
        const [hIn, mIn] = existing.in_time.split(":").map(Number);
        const [hOut, mOut] = timeNow.split(":").map(Number);
        const duration = ((hOut * 60 + mOut) - (hIn * 60 + mIn)) / 60;
        existing.work_duration = duration.toFixed(2) + " ساعة";
      }

      await existing.save();
      return res.json({ message: "👋 تم تسجيل خروجك رافقتك السلامة." });
    }

    res.json({ message: "❌ وضع غير معروف." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ حدث خطأ في السيرفر." });
  }
});

app.get("/", (req, res) => res.send("✅ Attendance Server Running..."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
