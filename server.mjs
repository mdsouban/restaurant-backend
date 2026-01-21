import express from "express";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const app = express();
app.use(express.json());

// --------------------
// ✅ CORS Setup
// --------------------
const allowedOrigins = [
  "http://localhost:5175",
  "http://localhost:5174",
  "http://localhost:5173",

  // Termux network host (your local mobile/PC)
  "http://192.0.0.2:5175",
  "http://192.0.0.2:5174",
  "http://192.0.0.2:5173",

  "http://10.188.65.73:5175",
  "http://10.188.65.73:5174",
  "http://10.188.65.73:5173",

  // ✅ Vercel frontend (your deployed url)
  "https://restaurant-frontend-five-snowy.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow no-origin requests (Postman / curl / browser direct open)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

app.options("*", cors());

// --------------------
// ✅ LowDB setup
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbFile = join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data ||= { menu: [], bills: [] }; // default tables
  await db.write();
}

await initDB();

// --------------------
// ✅ Health check
// --------------------
app.get("/", (req, res) => {
  res.send("Restaurant POS Backend running ✅");
});

// --------------------
// ✅ GET Menu
// --------------------
app.get("/api/menu", async (req, res) => {
  await db.read();
  res.json(db.data.menu || []);
});

// --------------------
// ✅ ADD Menu Item
// --------------------
app.post("/api/menu", async (req, res) => {
  try {
    const { name, price } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const p = Number(price);
    if (isNaN(p) || p <= 0) {
      return res.status(400).json({ message: "Valid price is required" });
    }

    await db.read();

    const item = {
      id: Date.now(),
      name: String(name).trim(),
      price: p,
    };

    db.data.menu.push(item);
    await db.write();

    res.json({ message: "Item saved", item });
  } catch (err) {
    console.log("MENU SAVE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------------------
// ✅ UPDATE Menu Item
// --------------------
app.put("/api/menu/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, price } = req.body;

    await db.read();

    const idx = db.data.menu.findIndex((x) => Number(x.id) === id);
    if (idx === -1) return res.status(404).json({ message: "Item not found" });

    if (name !== undefined) db.data.menu[idx].name = String(name).trim();
    if (price !== undefined) db.data.menu[idx].price = Number(price);

    await db.write();

    res.json({ message: "Item updated", item: db.data.menu[idx] });
  } catch (err) {
    console.log("MENU UPDATE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------------------
// ✅ DELETE Menu Item
// --------------------
app.delete("/api/menu/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.read();
    db.data.menu = (db.data.menu || []).filter((x) => Number(x.id) !== id);

    await db.write();
    res.json({ message: "Item deleted" });
  } catch (err) {
    console.log("MENU DELETE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------------------
// ✅ CREATE BILL
// returns invoiceId
// --------------------
app.post("/api/bill", async (req, res) => {
  try {
    const { mobile, items, total } = req.body;

    if (!mobile || !/^[0-9]{10}$/.test(String(mobile))) {
      return res.status(400).json({ message: "Valid 10 digit mobile required" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items required" });
    }

    await db.read();

    const invoice = {
      id: Date.now(), // invoiceId
      mobile: String(mobile),
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

// --------------------
// ✅ GET BILL by invoiceId
// FIX for: Cannot GET /api/bill/123
// --------------------
app.get("/api/bill/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.read();

    const bill = (db.data.bills || []).find((x) => Number(x.id) === id);

    if (!bill) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(bill);
  } catch (err) {
    console.log("GET BILL ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------------------
// ✅ Start Server (Render uses PORT)
// --------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ Server running on port:", PORT);
});
