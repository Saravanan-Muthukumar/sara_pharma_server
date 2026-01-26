const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

dotenv.config();

/* =========================
   DB
========================= */
const db = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  port: process.env.DB_PORT,
});

/* =========================
   APP
========================= */
const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;

/* =========================
   HELPERS
========================= */
const STATUSES = ["TO_TAKE", "TAKING", "TO_VERIFY", "VERIFYING", "PACKED"];

const clean = (v) => (v === undefined || v === null ? "" : String(v).trim());

const canTransition = (from, to) => {
  const map = {
    TO_TAKE: ["TAKING"],
    TAKING: ["TO_VERIFY"],
    TO_VERIFY: ["VERIFYING"],
    VERIFYING: ["PACKED"],
    PACKED: [],
  };
  return map[from]?.includes(to);
};

const getActiveCount = (username) =>
  new Promise((resolve, reject) => {
    const q = `
      SELECT COUNT(*) c FROM packing
      WHERE
        (status='TAKING' AND taken_by=?)
        OR
        (status='VERIFYING' AND packed_by=?)
    `;
    db.query(q, [username, username], (e, r) => {
      if (e) reject(e);
      else resolve(r[0].c);
    });
  });

/* =========================
   BASIC
========================= */
app.get("/", (_, res) => res.send("Packing API running"));

/* =========================
   AUTH
========================= */
app.post("/login1", (req, res) => {
  const q = "SELECT * FROM users WHERE username=?";
  db.query(q, [req.body.username], (e, d) => {
    if (e) return res.status(500).json(e);
    if (!d.length) return res.status(404).json("User not found");

    if (!bcrypt.compareSync(req.body.password, d[0].password))
      return res.status(400).json("Invalid credentials");

    const { password, ...user } = d[0];
    const token = jwt.sign({ id: user.id }, "jwtkey");

    res.cookie("access_token", token, { httpOnly: true }).json(user);
  });
});

/* =========================
   PACKING – LISTS
========================= */

/** MAIN LIST (used by All Bills tab) */
app.get("/api/packing", (req, res) => {
  const status = clean(req.query.status);
  const search = clean(req.query.search);
  const scope = clean(req.query.scope);
  const username = clean(req.query.username);

  let sql = "SELECT * FROM packing WHERE 1=1";
  const params = [];

  if (status && status !== "ALL") {
    if (!STATUSES.includes(status))
      return res.status(400).json({ message: "Invalid status" });
    sql += " AND status=?";
    params.push(status);
  }

  if (search) {
    sql += " AND (invoice_number LIKE ? OR customer_name LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  if (scope === "mine" && username) {
    sql += " AND (taken_by=? OR packed_by=?)";
    params.push(username, username);
  }

  sql += " ORDER BY created_at DESC";

  db.query(sql, params, (e, r) =>
    e ? res.status(500).json(e) : res.json(r)
  );
});

/** MY JOB */
app.get("/api/me/job", (req, res) => {
  const u = clean(req.query.username);
  if (!u) return res.status(400).json("username required");

  const q = `
    SELECT * FROM packing
    WHERE
      (status='TAKING' AND taken_by=?)
      OR
      (status='VERIFYING' AND packed_by=?)
    ORDER BY updated_at DESC
    LIMIT 2
  `;
  db.query(q, [u, u], (e, r) =>
    e ? res.status(500).json(e) : res.json(r)
  );
});

/** TO TAKE (NO DATE FILTER) */
app.get("/api/me/bills-to-take", (_, res) => {
  db.query(
    "SELECT * FROM packing WHERE status='TO_TAKE' ORDER BY created_at DESC",
    (e, r) => (e ? res.status(500).json(e) : res.json(r))
  );
});

/** TO VERIFY (NO DATE FILTER) */
app.get("/api/me/bills-to-verify", (req, res) => {
  const u = clean(req.query.username);
  if (!u) return res.status(400).json("username required");

  const q = `
    SELECT * FROM packing
    WHERE status='TO_VERIFY'
      AND taken_by <> ?
    ORDER BY created_at DESC
  `;
  db.query(q, [u], (e, r) =>
    e ? res.status(500).json(e) : res.json(r)
  );
});

/* =========================
   PACKING – ACTIONS
========================= */
app.post("/api/packing/start-taking", async (req, res) => {
  const { invoice_id, username } = req.body;
  if (!invoice_id || !username) return res.status(400).json("missing data");

  if ((await getActiveCount(username)) >= 2)
    return res.status(403).json("Max 2 active invoices");

  db.query("SELECT * FROM packing WHERE invoice_id=?", [invoice_id], (e, r) => {
    if (e || !r.length) return res.status(400).json("Invoice not found");
    if (r[0].status !== "TO_TAKE")
      return res.status(400).json("Invalid status");

    db.query(
      `UPDATE packing
       SET status='TAKING', taken_by=?, take_started_at=NOW()
       WHERE invoice_id=?`,
      [username, invoice_id],
      () => res.json({ ok: true })
    );
  });
});

app.post("/api/packing/mark-taken", (req, res) => {
  const { invoice_id, username } = req.body;

  db.query("SELECT * FROM packing WHERE invoice_id=?", [invoice_id], (e, r) => {
    if (e || !r.length) return res.status(400).json("Invoice not found");
    if (!canTransition(r[0].status, "TO_VERIFY"))
      return res.status(400).json(`Invalid transition: ${r[0].status}`);
    if (r[0].taken_by !== username)
      return res.status(403).json("Not owner");

    db.query(
      `UPDATE packing
       SET status='TO_VERIFY', take_completed_at=NOW()
       WHERE invoice_id=?`,
      [invoice_id],
      () => res.json({ ok: true })
    );
  });
});

app.post("/api/packing/start-verify", async (req, res) => {
  const { invoice_id, username } = req.body;

  if ((await getActiveCount(username)) >= 2)
    return res.status(403).json("Max 2 active invoices");

  db.query("SELECT * FROM packing WHERE invoice_id=?", [invoice_id], (e, r) => {
    if (e || !r.length) return res.status(400).json("Invoice not found");
    if (!canTransition(r[0].status, "VERIFYING"))
      return res.status(400).json(`Invalid transition: ${r[0].status}`);
    if (r[0].taken_by === username)
      return res.status(403).json("Cannot verify own invoice");

    db.query(
      `UPDATE packing
       SET status='VERIFYING', packed_by=?, verify_started_at=NOW()
       WHERE invoice_id=?`,
      [username, invoice_id],
      () => res.json({ ok: true })
    );
  });
});

app.post("/api/packing/mark-packed", (req, res) => {
  const { invoice_id, username } = req.body;

  db.query("SELECT * FROM packing WHERE invoice_id=?", [invoice_id], (e, r) => {
    if (e || !r.length) return res.status(400).json("Invoice not found");
    if (!canTransition(r[0].status, "PACKED"))
      return res.status(400).json(`Invalid transition: ${r[0].status}`);
    if (r[0].packed_by !== username)
      return res.status(403).json("Not owner");

    db.query(
      `UPDATE packing
       SET status='PACKED', pack_completed_at=NOW()
       WHERE invoice_id=?`,
      [invoice_id],
      () => res.json({ ok: true })
    );
  });
});

/* =========================
   CREATE INVOICE
========================= */
app.post("/api/packing/create", (req, res) => {
  const {
    invoice_number,
    invoice_date,
    no_of_products,
    invoice_value,
    customer_name,
    rep_name,
    courier_name,
    created_by,
  } = req.body;

  const q = `
    INSERT INTO packing
    (invoice_number, invoice_date, no_of_products, invoice_value,
     customer_name, rep_name, courier_name,
     status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'TO_TAKE', ?, NOW(), NOW())
  `;

  db.query(
    q,
    [
      invoice_number,
      invoice_date,
      no_of_products,
      invoice_value || null,
      customer_name,
      rep_name || null,
      courier_name,
      created_by || null,
    ],
    (e, r) => {
      if (e?.code === "ER_DUP_ENTRY")
        return res.status(409).json("Invoice exists");
      if (e) return res.status(500).json(e);
      res.json({ ok: true, invoice_id: r.insertId });
    }
  );
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () =>
  console.log(`🚀 Packing API running on port ${PORT}`)
);
