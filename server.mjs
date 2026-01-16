import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const app = express();
app.use(cors());
app.use(express.json());

// --------- FILE / PATH SETUP ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));

// --------- DB SETUP ----------
const dbFile = path.join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { menu: [], bills: [] });

async function initDb() {
  await db.read();
  db.data ||= { menu: [], bills: [] };
  db.data.menu ||= [];
  db.data.bills ||= [];
  await db.write();
}
await initDb();

// --------- MULTER (IMAGE UPLOAD) ----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});

const upload = multer({ storage });

// ✅ Health check
app.get("/", (req, res) => {
  res.send("Restaurant POS Backend is running ✅");
});

// ✅ GET menu items
app.get("/api/menu", async (req, res) => {
  await db.read();
  res.json(db.data.menu);
});

// ✅ POST add menu item (with optional image)
app.post("/api/menu", upload.single("image"), async (req, res) => {
  try {
    const { name, price } = req.body;

    if (!name || !price) {
      return res.status(400).json({ message: "Name and price are required" });
    }

    await db.read();

    const newItem = {
      id: Date.now(),
      name: name.trim(),
      price: Number(price),
      imageUrl: req.file ? `/uploads/${req.file.filename}` : "",
      createdAt: new Date().toISOString(),
    };

    db.data.menu.push(newItem);
    await db.write();

    res.json({ message: "Item saved", item: newItem });
  } catch (err) {
    console.log("MENU SAVE ERROR:", err);
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
    console.log("DELETE MENU ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

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

// ✅ GET invoice by id
app.get("/api/bill/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.read();

    const bill = db.data.bills.find(b => b.id === id);

    if (!bill) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(bill);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// ✅ Report by date (YYYY-MM-DD)
app.get("/api/report", async (req, res) => {
  try {
    const { date } = req.query; // 2026-01-12

    await db.read();
    let bills = db.data.bills;

    if (date) {
      bills = bills.filter((b) => (b.date || "").startsWith(date));
    }

    const totalSales = bills.reduce((sum, b) => sum + Number(b.total || 0), 0);

    res.json({ bills, totalSales });
  } catch (err) {
    console.log("REPORT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------- START SERVER ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("✅ Backend running on port", PORT);
});
