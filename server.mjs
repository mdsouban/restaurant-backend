import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const app = express();
const PORT = process.env.PORT || 10000;

/* -------------------- Fix __dirname (ESM) -------------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------- LowDB setup -------------------- */
const dbFile = path.join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { menu: [], bills: [] });

await db.read();
db.data ||= { menu: [], bills: [] };
await db.write();

/* -------------------- Middleware -------------------- */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -------------------- Upload folder setup -------------------- */
const uploadDir = path.join(process.cwd(), "uploads");

// Create uploads folder automatically (VERY IMPORTANT for Render)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Make uploads accessible in browser
app.use("/uploads", express.static(uploadDir));

/* -------------------- Multer setup -------------------- */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

const upload = multer({ storage });

/* -------------------- HEALTH CHECK -------------------- */
app.get("/", (req, res) => {
  res.send("✅ Restaurant backend is running");
});

/* ============================================================
   ✅ MENU APIs
============================================================ */

// ✅ GET Menu items
app.get("/api/menu", async (req, res) => {
  await db.read();
  res.json(db.data.menu || []);
});

// ✅ POST save menu item with image
app.post("/api/menu", upload.single("image"), async (req, res) => {
  try {
    const { name, price } = req.body;

    if (!name || !price) {
      return res.status(400).json({ message: "Name and Price required" });
    }

    await db.read();

    const newItem = {
      id: Date.now(),
      name: name.trim(),
      price: Number(price),
      image: req.file ? `/uploads/${req.file.filename}` : "",
    };

    db.data.menu.push(newItem);
    await db.write();

    res.json({ message: "Item saved", item: newItem });
  } catch (err) {
    console.log("SAVE ITEM ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// ✅ DELETE menu item
app.delete("/api/menu/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.read();
    db.data.menu = db.data.menu.filter((x) => x.id !== id);
    await db.write();

    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ============================================================
   ✅ BILL / INVOICE APIs
============================================================ */

// ✅ POST create bill (returns invoiceId)
app.post("/api/bill", async (req, res) => {
  try {
    const { mobile, items, total } = req.body;

    if (!mobile || !items || items.length === 0) {
      return res.status(400).json({ message: "Mobile and items required" });
    }

    await db.read();

    const invoice = {
      id: Date.now(), // invoiceId
      mobile,
      items,
      total: Number(total || 0),
      date: new Date().toISOString(),
    };

    db.data.bills.push(invoice);
    await db.write();

    res.json({
      message: "Bill created",
      invoiceId: invoice.id,
    });
  } catch (err) {
    console.log("BILL ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET invoice by ID
app.get("/api/invoice/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.read();
    const invoice = db.data.bills.find((b) => b.id === id);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ============================================================
   ✅ REPORT API
============================================================ */

// ✅ GET daily report by date
// Example: /api/report?date=2026-01-11
app.get("/api/report", async (req, res) => {
  try {
    const { date } = req.query;

    await db.read();
    const bills = db.data.bills || [];

    if (!date) return res.json(bills);

    const filtered = bills.filter((b) => {
      const billDate = (b.date || "").slice(0, 10);
      return billDate === date;
    });

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* -------------------- Start server -------------------- */
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
