const express = require("express");
const cors    = require("cors");
const xlsx    = require("xlsx");
const multer  = require("multer");
const path    = require("path");

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(__dirname)); // HTML, JS, CSS dosyalarını sun

// Multer — bellekte tut (diske yazmaya gerek yok)
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // max 20 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") cb(null, true);
    else cb(new Error("Sadece .xlsx / .xls dosyaları kabul edilir."));
  },
});

// Bellekte son yüklenen veriyi tut
let cachedData    = [];
let cachedColumns = [];

/* ── Yardımcı: Excel buffer → temiz JSON ── */
function parseExcel(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rawData  = xlsx.utils.sheet_to_json(sheet);

  if (rawData.length === 0) return { data: [], columns: [] };

  // Sütun isimlerini kaydet (ML sayfası için)
  const columns = Object.keys(rawData[0]);

  const cleanData = rawData
    .map((row) => {
      const keys = Object.keys(row);
      const getValue = (keyword) => {
        const keyName = keys.find((k) =>
          k.toUpperCase().includes(keyword.toUpperCase())
        );
        let val = keyName ? row[keyName] : 0;
        if (typeof val === "string") return parseFloat(val.replace(",", "."));
        return Number(val) || 0;
      };

      // Saat dönüşümü
      let timeStr = row["SAAT"] || row[keys[1]] || "12:00:00";
      if (typeof timeStr === "number") {
        const totalSeconds = Math.floor(timeStr * 24 * 60 * 60);
        const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
        const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
        const s = (totalSeconds % 60).toString().padStart(2, "0");
        timeStr = `${h}:${m}:${s}`;
      }

      // Tarih — Excel'deki tarih sütunundan oku, yoksa bugünün tarihini kullan
      let dateStr = "—";
      const dateKey = keys.find((k) => k.toUpperCase().includes("TARIH") || k.toUpperCase().includes("TARİH") || k.toUpperCase() === "DATE");
      if (dateKey && row[dateKey]) {
        const d = row[dateKey];
        if (typeof d === "number") {
          // Excel serial date → JS Date (Excel epoch: 1 Jan 1900, JS: 1 Jan 1970)
          // 25569 = days between 1900-01-01 and 1970-01-01
          const jsDate = new Date(Math.round((d - 25569) * 86400 * 1000));
          const dd = String(jsDate.getUTCDate()).padStart(2, "0");
          const mm = String(jsDate.getUTCMonth() + 1).padStart(2, "0");
          const yyyy = jsDate.getUTCFullYear();
          dateStr = `${dd}.${mm}.${yyyy}`;
        } else {
          dateStr = String(d);
        }
      } else {
        const today = new Date();
        dateStr = `${String(today.getDate()).padStart(2,"0")}.${String(today.getMonth()+1).padStart(2,"0")}.${today.getFullYear()}`;
      }

      return {
        date: dateStr,
        time: timeStr,
        volt: getValue("VOLTAJ"),
        amp:  getValue("AKIM"),
        pow:  getValue("GÜÇ"),
        temp: getValue("SICAKLIĞI"),
        loss: getValue("KAYBI"),
        perf: getValue("ORANI"),
      };
    })
    .filter((r) => r.volt !== 0 || r.amp !== 0 || r.pow !== 0 || r.temp !== 0);

  return { data: cleanData, columns };
}

/* ── POST /api/upload — Excel dosyası al ── */
app.post("/api/upload", upload.single("excel"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Dosya bulunamadı." });
    }

    const result    = parseExcel(req.file.buffer);
    cachedData      = result.data;
    cachedColumns   = result.columns;

    console.log(`[upload] ${req.file.originalname} — ${cachedData.length} kayıt yüklendi.`);
    res.json(cachedData);
  } catch (err) {
    console.error("Upload hatası:", err);
    res.status(500).json({ error: "Excel işlenirken hata: " + err.message });
  }
});

/* ── GET /api/veriler — bellekteki veriyi döndür ── */
app.get("/api/veriler", (req, res) => {
  res.json(cachedData);
});

/* ── GET /api/kolonlar — sütun isimlerini döndür (ML için) ── */
app.get("/api/kolonlar", (req, res) => {
  res.json(cachedColumns);
});

app.listen(PORT, () => {
  console.log(`Node.js sunucusu çalışıyor: http://localhost:${PORT}`);
});
