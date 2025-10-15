import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleSpreadsheet } from "google-spreadsheet";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const RESTAURANT_LAT = parseFloat(process.env.RESTAURANT_LAT);
const RESTAURANT_LON = parseFloat(process.env.RESTAURANT_LON);
const RADIUS = parseFloat(process.env.RADIUS);

// Google Sheets setup
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

async function accessSheet() {
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  });
  await doc.loadInfo();
  return doc.sheetsByIndex[0];
}

// دالة حساب المسافة (هارفيساين)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 📌 API: تسجيل الحضور والانصراف
app.post("/attendance", async (req, res) => {
  const { name, mode, lat, lon } = req.body;
  if (!name || !mode || !lat || !lon)
    return res.status(400).json({ message: "❌ البيانات ناقصة" });

  const distance = getDistance(lat, lon, RESTAURANT_LAT, RESTAURANT_LON);
  if (distance > RADIUS)
    return res.json({ message: "🚫 يجب أن تكون داخل المطعم لتسجيل الدخول أو الخروج." });

  try {
    const sheet = await accessSheet();
    const rows = await sheet.getRows();
    const today = new Date().toLocaleDateString("ar-SY");

    if (mode === "in") {
      const existing = rows.find(r => r.name === name && r.date === today);
      if (existing) return res.json({ message: "✅ لقد سجلت دخولك مسبقًا اليوم." });

      await sheet.addRow({
        name,
        date: today,
        in_time: new Date().toLocaleTimeString("ar-SY"),
        out_time: "",
        work_duration: "",
      });
      return res.json({ message: "✅ تم تسجيل الدخول بنجاح." });
    }

    if (mode === "out") {
      const existing = rows.find(r => r.name === name && r.date === today);
      if (!existing)
        return res.json({ message: "❌ لم تسجل دخولك اليوم." });
      if (existing.out_time)
        return res.json({ message: "⚠️ لقد سجلت خروجك مسبقًا." });

      const inTime = new Date(`${today} ${existing.in_time}`);
      const outTime = new Date();
      const diffMs = outTime - inTime;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const duration = `${hours}س ${minutes}د`;

      existing.out_time = outTime.toLocaleTimeString("ar-SY");
      existing.work_duration = duration;
      await existing.save();

      return res.json({ message: `👋 تم تسجيل الخروج. مدة العمل: ${duration}` });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "⚠️ حدث خطأ في الخادم." });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
