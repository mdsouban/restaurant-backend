import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================
// ✅ lowdb setup
// ==============================
const adapter = new JSONFile(path.join(__dirname, "db.json"));
const db = new Low(adapter, {
  menu: [],
  bills: []
});

await db.read();
await db.write();

// ==============================
// ✅ Uploads folder (images)
// ==============================
const uploadsDir = path.join(__dirname, "uploads");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "_" + file.originalname.replace(/\s+/g, "_"));
  }
});

const upload = multer({ storage });

// Serve images
app.use("/uploads", express.static(uploadsDir));

// ==============================
// ✅ MENU APIs
// ==============================

// Get menu items
app.get("/menu", async (req, res) => {
  await db.read();
  res.json(db.data.menu);
});

// Add menu item (with image upload)
app.post("/menu", upload.single("image"), async (req, res) => {
  const { name, price } = req.body;

  if (!name || !price) {
    return res.status(400).json({ message: "name and price required" });
  }

  const item = {
    id: nanoid(),
    name: name.trim(),
    price: Number(price),
    image: req.file ? req.file.filename : null
  };

  await db.read();
  db.data.menu.push(item);
  await db.write();

  res.json(item);
});

// ==============================
// ✅ BILL APIs
// ==============================

// Save bill
app.post("/bill", async (req, res) => {
  const { mobile, items, total } = req.body;

  if (!mobile || !items || !Array.isArray(items)) {
    return res.status(400).json({ message: "Invalid bill data" });
  }

  const invoiceId = "INV" + Date.now();

  const bill = {
    id: nanoid(),
    invoiceId,
    mobile,
    items,
    total: Number(total || 0),
    date: new Date().toISOString()
  };

  await db.read();
  db.data.bills.push(bill);
  await db.write();

  res.json({ ok: true, invoiceId });
});
app.get("/invoice/:invoiceId", async (req, res) => {
  const { invoiceId } = req.params;

  await db.read();
  const bill = db.data.bills.find(b => b.invoiceId === invoiceId);

  if (!bill) return res.status(404).json({ message: "Invoice not found" });

  res.json(bill);
});
// Daily report (today only)
app.get("/report", async (req, res) => {
  await db.read();

  // date comes from query like: /report?date=2026-01-10
  const selectedDate =
    req.query.date || new Date().toISOString().slice(0, 10);

  const result = db.data.bills.filter(b =>
    (b.date || "").startsWith(selectedDate)
  );

  res.json(result);
});
// ==============================
// ✅ Start server
// ==============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
