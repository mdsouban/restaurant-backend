import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());

// --------------------
// ✅ CORS Setup
// --------------------
const allowedOrigins = [
  "http://localhost:5175",
  "http://localhost:5174",
  "http://localhost:5173",

  "http://192.0.0.2:5175",
  "http://192.0.0.2:5174",
  "http://192.0.0.2:5173",

  "http://10.188.65.73:5175",
  "http://10.188.65.73:5174",
  "http://10.188.65.73:5173",

  "https://restaurant-frontend-five-snowy.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

app.options("*", cors());

// --------------------
// ✅ PostgreSQL connection
// --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// --------------------
// ✅ Create Tables if not exists
// --------------------
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id BIGSERIAL PRIMARY KEY,
      mobile VARCHAR(20) NOT NULL,
      total NUMERIC(12,2) DEFAULT 0,
      items JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log("✅ PostgreSQL tables ready");
}

await initDB();

// --------------------
// ✅ Health check
// --------------------
app.get("/", (req, res) => {
  res.send("Restaurant POS Backend running ✅ (PostgreSQL)");
});

// --------------------
// ✅ GET Menu
// --------------------
app.get("/api/menu", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, price FROM menu ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.log("GET MENU ERROR:", err);
    res.status(500).json({ message: err.message });
  }
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

    const result = await pool.query(
      "INSERT INTO menu (name, price) VALUES ($1, $2) RETURNING id, name, price",
      [String(name).trim(), p]
    );

    res.json({ message: "Item saved", item: result.rows[0] });
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

    if (!id) return res.status(400).json({ message: "Invalid ID" });

    const existing = await pool.query("SELECT * FROM menu WHERE id=$1", [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    const newName =
      name !== undefined ? String(name).trim() : existing.rows[0].name;
    const newPrice =
      price !== undefined ? Number(price) : Number(existing.rows[0].price);

    const result = await pool.query(
      "UPDATE menu SET name=$1, price=$2 WHERE id=$3 RETURNING id, name, price",
      [newName, newPrice, id]
    );

    res.json({ message: "Item updated", item: result.rows[0] });
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

    await pool.query("DELETE FROM menu WHERE id=$1", [id]);
    res.json({ message: "Item deleted" });
  } catch (err) {
    console.log("MENU DELETE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------------------
// ✅ CREATE BILL (returns invoiceId)
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

    const t = Number(total || 0);

    const result = await pool.query(
      `INSERT INTO bills (mobile, total, items)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [String(mobile), t, JSON.stringify(items)]
    );

    res.json({
      message: "Bill created",
      invoiceId: result.rows[0].id,
    });
  } catch (err) {
    console.log("BILL CREATE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------------------
// ✅ GET BILL by invoiceId
// --------------------
app.get("/api/bill/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const result = await pool.query(
      "SELECT id, mobile, total, items, created_at FROM bills WHERE id=$1",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const bill = result.rows[0];

    res.json({
      id: bill.id,
      mobile: bill.mobile,
      total: Number(bill.total || 0),
      items: bill.items || [],
      date: bill.created_at,
    });
  } catch (err) {
    console.log("GET BILL ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// --------------------
// ✅ Start Server
// --------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ Server running on port:", PORT);
});
