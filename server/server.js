// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // for index.html

// إعداد المتغيرات البيئية
const RADIUS = parseFloat(process.env.RADIUS || 50); // بالمتر
const RESTAURANT_LAT = parseFloat(process.env.RESTAURANT_LAT);
const RESTAURANT_LON = parseFloat(process.env.RESTAURANT_LON);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

// إعداد Google Sheets API
const auth = new google.auth.JWT(
  SERVICE_ACCOUNT_EMAIL,
  null,
  PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

// الدالة لحساب المسافة بين نقطتين باستخدام Haversine Formula
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // نصف قطر الأرض بالمتر
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ➕ تسجيل دخول
app.post('/checkin', async (req, res) => {
  const { name, lat, lon } = req.body;

  const distance = getDistanceFromLatLonInMeters(lat, lon, RESTAURANT_LAT, RESTAURANT_LON);
  if (distance > RADIUS) {
    return res.status(400).json({ message: 'أنت خارج نطاق الموقع المسموح به.' });
  }

  const date = new Date();
  const today = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = date.toLocaleTimeString('en-GB');  // HH:mm:ss

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[name, today, time, '']],
      },
    });
    res.json({ message: 'تم تسجيل الدخول بنجاح.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'فشل في التسجيل.' });
  }
});

// ⛔ تسجيل خروج
app.post('/checkout', async (req, res) => {
  const { name, lat, lon } = req.body;

  const distance = getDistanceFromLatLonInMeters(lat, lon, RESTAURANT_LAT, RESTAURANT_LON);
  if (distance > RADIUS) {
    return res.status(400).json({ message: 'أنت خارج نطاق الموقع المسموح به.' });
  }

  const date = new Date();
  const today = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = date.toLocaleTimeString('en-GB');  // HH:mm:ss

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:D',
    });

    const rows = result.data.values || [];
    let updated = false;

    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][0] === name && rows[i][1] === today && !rows[i][3]) {
        const rowIndex = i + 1; // because sheets are 1-indexed
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Sheet1!D${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[time]],
          },
        });
        updated = true;
        break;
      }
    }

    if (updated) {
      res.json({ message: 'تم تسجيل الخروج بنجاح.' });
    } else {
      res.status(400).json({ message: 'لم يتم تسجيل دخولك اليوم.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'فشل في تسجيل الخروج.' });
  }
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
