import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

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
// ✅ PostgreSQL Connection
// --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Render postgres
  },
});

// --------------------
// ✅ Create tables automatically
// --------------------
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id BIGSERIAL PRIMARY KEY,
      mobile VARCHAR(15) NOT NULL,
      total NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bill_items (
      id BIGSERIAL PRIMARY KEY,
      bill_id BIGINT REFERENCES bills(id) ON DELETE CASCADE,
      item_name VARCHAR(150) NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      qty INT NOT NULL DEFAULT 1
    );
  `);

  console.log("✅ PostgreSQL tables ready");
}
initDB().catch((e) => console.log("DB INIT ERROR:", e));

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
    const result = await pool.query("SELECT * FROM menu ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.log("MENU GET ERROR:", err);
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
      "INSERT INTO menu (name, price) VALUES ($1, $2) RETURNING *",
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

    const existing = await pool.query("SELECT * FROM menu WHERE id=$1", [id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: "Item not found" });

    const newName =
      name !== undefined ? String(name).trim() : existing.rows[0].name;
    const newPrice =
      price !== undefined ? Number(price) : Number(existing.rows[0].price);

    const result = await pool.query(
      "UPDATE menu SET name=$1, price=$2 WHERE id=$3 RETURNING *",
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

    const billResult = await pool.query(
      `INSERT INTO bills (mobile, total)
       VALUES ($1, $2)
       RETURNING id`,
      [mobile, total]
    );

    const billId = billResult.rows[0].id;

    for (const item of items) {
      await pool.query(
        `INSERT INTO bill_items (bill_id, item_name, price, qty)
         VALUES ($1, $2, $3, $4)`,
        [billId, item.name, item.price, item.qty]
      );
    }

    res.json({
      message: "Bill created",
      invoiceId: billId,   // ✅ REAL ID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create bill" });
  }
});

// --------------------
// ✅ GET BILL by invoiceId
// --------------------
app.get("/api/bill/:id", async (req, res) => {
  const id = Number(req.params.id);

  const bill = await pool.query(
    `SELECT * FROM bills WHERE id=$1`,
    [id]
  );

  if (bill.rowCount === 0) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  const items = await pool.query(
    `SELECT * FROM bill_items WHERE bill_id=$1`,
    [id]
  );

  res.json({
    ...bill.rows[0],
    items: items.rows,
  });
});
// --------------------
// ✅ Start Server
// --------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ Server running on port:", PORT);
});
