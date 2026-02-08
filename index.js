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

const db = mysql.createConnection({
  host: process.env.HOST || "sara-pharma-do-user-15769670-0.c.db.ondigitalocean.com",
  user: process.env.USER || "doadmin1",
  password: process.env.PASSWORD || "AVNS_S5lEfEbPAYykuTUXOdE",
  database: process.env.DATABASE || "sara_pharma",
  port: process.env.DB_PORT || "25060",
});

const app = express();

// If you need cookies auth cross-domain, enable credentials + set origin specifically.
// app.use(cors({ origin: true, credentials: true }));
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;

/* =========================
   HELPERS
========================= */

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
const clean = (v) => (isBlank(v) ? "" : String(v).trim());

const normalizeStatus = (s) => {
  const v = clean(s).toUpperCase();

  if (v === "TAKEN" || v === "TAKE" || v === "TAKEN " || v === "TAKEN_BILLS") return "TO_VERIFY";
  if (v === "PACKED") return "PACKED";

  if (v === "TO_TAKE") return "TO_TAKE";
  if (v === "TAKING") return "TAKING";
  if (v === "TO_VERIFY") return "TO_VERIFY";
  if (v === "VERIFYING") return "VERIFYING";

  // common human labels
  if (v.includes("TO TAKE")) return "TO_TAKE";
  if (v.includes("TO VERIFY")) return "TO_VERIFY";
  if (v.includes("VERIFY")) return "VERIFYING";
  if (v.includes("TAK")) return "TAKING";

  return v || "";
};

const STATUSES = ["TO_TAKE", "TAKING", "TO_VERIFY", "VERIFYING", "PACKED"];

const canTransition = (fromStatus, toStatus) => {
  const allowed = {
    TO_TAKE: ["TAKING"],
    TAKING: ["TO_VERIFY"],
    TO_VERIFY: ["VERIFYING"],
    VERIFYING: ["PACKED"],
    PACKED: [],
  };
  return (allowed[fromStatus] || []).includes(toStatus);
};

const getActiveCount = (username) =>
  new Promise((resolve, reject) => {
    const u = clean(username);
    const q = `
      SELECT COUNT(*) AS c
      FROM packing
      WHERE
        (status = 'TAKING' AND taken_by = ?)
        OR
        (status = 'VERIFYING' AND packed_by = ?)
    `;
    db.query(q, [u, u], (err, rows) => {
      if (err) return reject(err);
      resolve(Number(rows?.[0]?.c || 0));
    });
  });

/* =========================
   BASIC ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("Hello there! Api is working well");
});

/* =========================
   AUTH
========================= */

app.post("/register", (req, res) => {
  const q = "SELECT * FROM users WHERE email = ? OR username = ?";
  db.query(q, [req.body.email, req.body.username], (err, data) => {
    if (err) return res.status(500).json(err);
    if (data.length) return res.status(409).json("User already exists!");

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(req.body.password, salt);

    const q2 = "INSERT INTO users (`username`, `email`, `password`) VALUES (?);";
    const values = [req.body.username, req.body.email, hash];

    db.query(q2, [values], (err2) => {
      if (err2) return res.status(500).json(err2);
      return res.status(200).json("User created!");
    });
  });
});

app.post("/login1", (req, res) => {
  const q = "SELECT * FROM users WHERE username = ?";
  db.query(q, [req.body.username], (err, data) => {
    if (err) return res.status(500).json(err);
    if (data.length === 0) return res.status(404).json("User not found!");

    const isPasswordCorrect = bcrypt.compareSync(req.body.password, data[0].password);
    if (!isPasswordCorrect) return res.status(400).json("Wrong username or password!");

    const token = jwt.sign({ id: data[0].id }, "jwtkey");
    const { password, ...other } = data[0];

    res.cookie("access_token", token, { httpOnly: true }).status(200).json(other);
  });
});

app.post("/logout", (req, res) => {
  res
    .clearCookie("access_token", { sameSite: "none", secure: true })
    .status(200)
    .json("User has been logged out");
});

app.get("/api/getusers", (req, res) => {
  db.query("SELECT id, username, email, role FROM users", (error, result) => res.send(result));
});

/* =========================
   PACKING API (UPDATED)
   - show TO_TAKE and TO_VERIFY regardless of date
   - report based on completion dates (take_completed_at / pack_completed_at)
========================= */

app.get("/api/invoices/today", (req, res) => {
  const sql = `
    SELECT *
    FROM packing
    WHERE
      status IN ('TO_TAKE','TAKING','TO_VERIFY','VERIFYING')
      OR DATE(take_completed_at) = CURDATE()
      OR DATE(pack_completed_at) = CURDATE()
    ORDER BY updated_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// ✅ My active invoices (TAKING by me OR VERIFYING by me)
app.get("/api/me/job", (req, res) => {
  const username = clean(req.query.username);
  if (!username) return res.status(400).json({ message: "username required" });

  const q = `
    SELECT *
    FROM packing
    WHERE
      (status = 'TAKING' AND taken_by = ?)
      OR
      (status = 'VERIFYING' AND packed_by = ?)
    ORDER BY updated_at DESC
    LIMIT 2
  `;

  db.query(q, [username, username], (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// ✅ Bills to take (NO DATE FILTER)
app.get("/api/me/bills-to-take", (req, res) => {
  const q = "SELECT * FROM packing WHERE status = 'TO_TAKE' ORDER BY created_at DESC";
  db.query(q, [], (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// ✅ Bills to verify (NO DATE FILTER) but taken_by cannot verify the same invoice
app.get("/api/me/bills-to-verify", (req, res) => {
  const username = clean(req.query.username);
  if (!username) return res.status(400).json({ message: "username required" });

  const q = `
    SELECT *
    FROM packing
    WHERE status = 'TO_VERIFY'
      AND (taken_by IS NULL OR taken_by <> ?)
    ORDER BY created_at DESC
  `;

  db.query(q, [username], (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// ✅ Start taking: TO_TAKE -> TAKING
app.post("/api/packing/start-taking", async (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);
  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  try {
    const active = await getActiveCount(username);
    if (active >= 2) return res.status(403).json({ message: "You can work only 2 invoices at a time." });
  } catch (e) {
    return res.status(500).json(e);
  }

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];
    const st = normalizeStatus(row.status);

    if (st !== "TO_TAKE") return res.status(400).json({ message: `Invalid status: ${row.status}` });

    db.query(
      "UPDATE packing SET status='TAKING', taken_by=?, take_started_at=NOW(), updated_at=NOW() WHERE invoice_id=?",
      [username, invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ✅ Mark taken: TAKING -> TO_VERIFY
app.post("/api/packing/mark-taken", (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);
  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];
    const st = normalizeStatus(row.status);

    if (!canTransition(st, "TO_VERIFY"))
      return res.status(400).json({ message: `Invalid transition: ${row.status} -> TO_VERIFY` });

    if (clean(row.taken_by) !== username)
      return res.status(403).json({ message: "Only the staff who started taking can mark taken." });

    db.query(
      "UPDATE packing SET status='TO_VERIFY', take_completed_at=NOW(), updated_at=NOW() WHERE invoice_id=?",
      [invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ✅ Start verify: TO_VERIFY -> VERIFYING
// Fix for your error "Invalid transition: TAKEN -> VERIFYING":
// - If your DB still contains TAKEN/Taken, normalizeStatus() maps it to TO_VERIFY, so it will now work.
app.post("/api/packing/start-verify", async (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);
  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  try {
    const active = await getActiveCount(username);
    if (active >= 2) return res.status(403).json({ message: "You can work only 2 invoices at a time." });
  } catch (e) {
    return res.status(500).json(e);
  }

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];
    const st = normalizeStatus(row.status);

    if (!canTransition(st, "VERIFYING"))
      return res.status(400).json({ message: `Invalid transition: ${row.status} -> VERIFYING` });

    if (clean(row.taken_by) && clean(row.taken_by) === username)
      return res.status(403).json({ message: "The staff who took stock cannot verify & pack the same invoice." });

    db.query(
      "UPDATE packing SET status='VERIFYING', packed_by=?, verify_started_at=NOW(), updated_at=NOW() WHERE invoice_id=?",
      [username, invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ✅ Mark packed: VERIFYING -> PACKED
app.post("/api/packing/mark-packed", (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);
  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];
    const st = normalizeStatus(row.status);

    if (!canTransition(st, "PACKED"))
      return res.status(400).json({ message: `Invalid transition: ${row.status} -> PACKED` });

    if (clean(row.packed_by) !== username)
      return res.status(403).json({ message: "Only the staff who started verifying can mark packed." });

    db.query(
      "UPDATE packing SET status='PACKED', pack_completed_at=NOW(), updated_at=NOW() WHERE invoice_id=?",
      [invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ✅ Create invoice (Billing/Admin) -> status TO_TAKE
// NOTE: invoice_date is optional now (since you said UI/report should not rely on it).
app.post("/api/packing/create", (req, res) => {
  const invoice_number = clean(req.body.invoice_number);
  const invoice_date = clean(req.body.invoice_date) || null; // optional
  const no_of_products = req.body.no_of_products;
  const invoice_value = req.body.invoice_value;
  const customer_name = clean(req.body.customer_name);
  const rep_name = clean(req.body.rep_name) || null;
  const courier_name = clean(req.body.courier_name);
  const created_by = clean(req.body.created_by) || null;

  if (!invoice_number || !no_of_products || !customer_name || !courier_name) {
    return res.status(400).json({
      message: "invoice_number, no_of_products, customer_name, courier_name are required",
    });
  }

  const sql = `
    INSERT INTO packing
      (invoice_number, invoice_date, no_of_products, invoice_value,
       customer_name, rep_name, courier_name,
       status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'TO_TAKE', ?, NOW(), NOW())
  `;

  db.query(
    sql,
    [
      invoice_number,
      invoice_date,
      Number(no_of_products),
      invoice_value === "" || invoice_value === null || invoice_value === undefined ? null : Number(invoice_value),
      customer_name,
      rep_name,
      courier_name,
      created_by,
    ],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Invoice number already exists" });
        return res.status(500).json(err);
      }
      return res.status(200).json({ ok: true, invoice_id: result.insertId });
    }
  );
});

/* =========================
   REPORTS (FIXED)
   Based on:
   - take_completed_at + taken_by
   - pack_completed_at + packed_by
========================= */

// ✅ Per-user totals for a day (default today)
app.get("/api/reports/packing-daily", (req, res) => {
  const date = clean(req.query.date); // optional YYYY-MM-DD

  const whereTake = date ? "DATE(take_completed_at) = ?" : "DATE(take_completed_at) = CURDATE()";
  const wherePack = date ? "DATE(pack_completed_at) = ?" : "DATE(pack_completed_at) = CURDATE()";

  const takeSql = `
    SELECT taken_by AS username, COUNT(*) AS take_total
    FROM packing
    WHERE taken_by IS NOT NULL
      AND take_completed_at IS NOT NULL
      AND ${whereTake}
    GROUP BY taken_by
  `;

  const packSql = `
    SELECT packed_by AS username, COUNT(*) AS packed_total
    FROM packing
    WHERE packed_by IS NOT NULL
      AND pack_completed_at IS NOT NULL
      AND ${wherePack}
    GROUP BY packed_by
  `;

  const takeParams = date ? [date] : [];
  const packParams = date ? [date] : [];

  db.query(takeSql, takeParams, (e1, takeRows) => {
    if (e1) return res.status(500).json(e1);

    db.query(packSql, packParams, (e2, packRows) => {
      if (e2) return res.status(500).json(e2);

      const map = new Map();

      (takeRows || []).forEach((r) => {
        map.set(r.username, {
          username: r.username,
          take_total: Number(r.take_total || 0),
          packed_total: 0,
        });
      });

      (packRows || []).forEach((r) => {
        const existing = map.get(r.username) || { username: r.username, take_total: 0, packed_total: 0 };
        existing.packed_total = Number(r.packed_total || 0);
        map.set(r.username, existing);
      });

      const out = Array.from(map.values()).sort(
        (a, b) => b.take_total + b.packed_total - (a.take_total + a.packed_total)
      );

      return res.status(200).json(out);
    });
  });
});

// ✅ Current user's totals for a day (default today)
app.get("/api/reports/me/packing-daily", (req, res) => {
  const username = clean(req.query.username);
  const date = clean(req.query.date); // optional YYYY-MM-DD
  if (!username) return res.status(400).json({ message: "username required" });

  const takeWhere = date ? "DATE(take_completed_at)=?" : "DATE(take_completed_at)=CURDATE()";
  const packWhere = date ? "DATE(pack_completed_at)=?" : "DATE(pack_completed_at)=CURDATE()";

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM packing
        WHERE taken_by=? AND take_completed_at IS NOT NULL AND ${takeWhere}
      ) AS take_total,
      (SELECT COUNT(*) FROM packing
        WHERE packed_by=? AND pack_completed_at IS NOT NULL AND ${packWhere}
      ) AS packed_total
  `;

  const params = date ? [username, date, username, date] : [username, username];

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json(err);
    const r = rows?.[0] || {};
    return res.status(200).json({
      username,
      take_total: Number(r.take_total || 0),
      packed_total: Number(r.packed_total || 0),
    });
  });
});

/* =========================
   CUSTOMERS (CRUD) + courier_name
========================= */

app.get("/api/customers", (req, res) => {
  const q = String(req.query.q || "").trim();
  let sql = "SELECT customer_id, customer_name, city, rep_name, courier_name FROM customers";
  const params = [];

  if (q) {
    sql += " WHERE customer_name LIKE ? OR city LIKE ? OR rep_name LIKE ? OR courier_name LIKE ?";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += " ORDER BY customer_name ASC";

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

app.post("/api/customers", (req, res) => {
  const customer_name = String(req.body.customer_name || "").trim();
  const city = String(req.body.city || "").trim() || null;
  const rep_name = String(req.body.rep_name || "").trim() || null;
  const courier_name = String(req.body.courier_name || "").trim() || null;

  if (!customer_name) return res.status(400).json({ message: "customer_name is required" });

  const sql = "INSERT INTO customers (customer_name, city, rep_name, courier_name) VALUES (?, ?, ?, ?)";
  db.query(sql, [customer_name, city, rep_name, courier_name], (err, result) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json({ ok: true, customer_id: result.insertId });
  });
});

app.put("/api/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  const customer_name = String(req.body.customer_name || "").trim();
  const city = String(req.body.city || "").trim() || null;
  const rep_name = String(req.body.rep_name || "").trim() || null;
  const courier_name = String(req.body.courier_name || "").trim() || null;

  if (!id) return res.status(400).json({ message: "invalid id" });
  if (!customer_name) return res.status(400).json({ message: "customer_name is required" });

  const sql = "UPDATE customers SET customer_name=?, city=?, rep_name=?, courier_name=? WHERE customer_id=?";
  db.query(sql, [customer_name, city, rep_name, courier_name, id], (err) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json({ ok: true });
  });
});

app.delete("/api/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "invalid id" });

  db.query("DELETE FROM customers WHERE customer_id=?", [id], (err) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json({ ok: true });
  });
});

app.post("/api/feedbacklist", (req, res) => {
  // 1) If ANY unconfirmed exists (yesterday or today), return it
  const pendingSql = `
    SELECT *
    FROM feedback
    WHERE courier_date IS NULL
    ORDER BY pack_completed_at ASC, courier_name ASC, customer_name ASC
  `;

  db.query(pendingSql, (err, pending) => {
    if (err) return res.status(500).json({ message: "Check failed", err });

    if ((pending || []).length > 0) {
      return res.status(200).json({ mode: "pending", rows: pending });
    }

    // 2) No pending => if today's pack list already exists, return it (VIEW)
    const todaySql = `
      SELECT *
      FROM feedback
      WHERE DATE(pack_completed_at) = CURDATE()
        AND UPPER(TRIM(courier_name)) IN ('ST','PROFESSIONAL')
      ORDER BY pack_completed_at ASC, courier_name ASC, customer_name ASC
    `;

    db.query(todaySql, (err2, todayRows) => {
      if (err2) return res.status(500).json({ message: "Today fetch failed", err: err2 });

      if ((todayRows || []).length > 0) {
        return res.status(200).json({ mode: "view", rows: todayRows });
      }

      // 3) Nothing pending + nothing today => CREATE today's list
      const insertSql = `
        INSERT INTO feedback (
          courier_date,
          invoice_date,
          pack_completed_at,
          courier_name,
          customer_name,
          city,
          rep_name,
          invoice_count,
          no_of_box,
          stock_received,
          stocks_ok,
          follow_up,
          feedback_time,
          issue_resolved_time
        )
        SELECT
          NULL AS courier_date,
          DATE_FORMAT(p.invoice_date, '%Y-%m-%d') AS invoice_date,
          MAX(p.pack_completed_at) AS pack_completed_at,
          UPPER(TRIM(p.courier_name)) AS courier_name,
          TRIM(p.customer_name) AS customer_name,
          TRIM(COALESCE(c.city, '')) AS city,
          TRIM(COALESCE(p.rep_name, c.rep_name, '')) AS rep_name,
          COUNT(*) AS invoice_count,
          NULL AS no_of_box,
          NULL AS stock_received,
          NULL AS stocks_ok,
          NULL AS follow_up,
          NULL AS feedback_time,
          NULL AS issue_resolved_time
        FROM packing p
        LEFT JOIN customers c
          ON LOWER(TRIM(c.customer_name)) = LOWER(TRIM(p.customer_name))
        WHERE p.status = 'PACKED'
          AND DATE(p.pack_completed_at) = CURDATE()
          AND UPPER(TRIM(p.courier_name)) IN ('ST','PROFESSIONAL')
        GROUP BY
          DATE_FORMAT(p.invoice_date, '%Y-%m-%d'),
          DATE(p.pack_completed_at),
          UPPER(TRIM(p.courier_name)),
          TRIM(p.customer_name),
          TRIM(COALESCE(c.city, '')),
          TRIM(COALESCE(p.rep_name, c.rep_name, ''))
      `;

      db.query(insertSql, (err3) => {
        if (err3) return res.status(500).json({ message: "Insert failed", err: err3 });

        db.query(todaySql, (err4, createdRows) => {
          if (err4) return res.status(500).json({ message: "Fetch failed", err: err4 });
          return res.status(200).json({ mode: "created", rows: createdRows || [] });
        });
      });
    });
  });
});


app.post("/api/feedback/box", (req, res) => {
  const feedback_id = Number(req.body?.feedback_id);
  const raw = req.body?.no_of_box;

  if (!Number.isFinite(feedback_id) || feedback_id <= 0) {
    return res.status(400).json({ message: "Invalid feedback_id" });
  }

  // allow null (clear)
  let no_of_box = null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return res.status(400).json({ message: "no_of_box must be a non-negative integer" });
    }
    no_of_box = n;
  }

  const sql = "UPDATE feedback SET no_of_box = ? WHERE feedback_id = ?";
  db.query(sql, [no_of_box, feedback_id], (err) => {
    if (err) return res.status(500).json({ message: "Update failed", err });
    return res.status(200).json({ ok: true, feedback_id, no_of_box });
  });
});

app.post("/api/feedback/confirm-courier-bulk", (req, res) => {
  const { feedback_ids, courier_date } = req.body;

  if (!Array.isArray(feedback_ids) || feedback_ids.length === 0 || !courier_date) {
    return res.status(400).json({ message: "feedback_ids[] and courier_date are required" });
  }

  const ids = [...new Set(feedback_ids)].map(Number).filter(Boolean);
  if (ids.length === 0) {
    return res.status(400).json({ message: "feedback_ids must contain valid numbers" });
  }

  const selectSql = `
    SELECT feedback_id, customer_name, courier_name, pack_completed_at, no_of_box, courier_date
    FROM feedback
    WHERE feedback_id IN (?)
  `;

  db.query(selectSql, [ids], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });

    const list = Array.isArray(rows) ? rows : [];

    // Only validate rows that are still unconfirmed
    const unconfirmed = list.filter((r) => r.courier_date == null);

    const missing = unconfirmed
      .filter((r) => r.no_of_box == null || r.no_of_box === "")
      .map((r) => ({
        feedback_id: r.feedback_id,
        customer_name: r.customer_name,
        courier_name: r.courier_name,
        packed_date: r.pack_completed_at ? String(r.pack_completed_at).slice(0, 10) : null,
      }));

    if (missing.length > 0) {
      return res.status(400).json({
        message: "Please update No. of Box for all customers before confirming",
        missing,
      });
    }

    const updateSql = `
      UPDATE feedback
      SET courier_date = ?
      WHERE feedback_id IN (?)
        AND courier_date IS NULL
    `;

    db.query(updateSql, [courier_date, ids], (err2, result) => {
      if (err2) return res.status(500).json({ message: "DB update failed", err: err2 });

      return res.json({
        message: "Courier confirmed",
        updated: result?.affectedRows || 0,
      });
    });
  });
});

app.get("/api/feedback/open", (req, res) => {
  const loginName = req.user?.username || req.user?.name; // support both
  if (!loginName) return res.status(401).json({ message: "Unauthorized" });
  const isAdmin = loginName.toLowerCase() === "admin";
  

  const { customer, invoice_date, courier_date, status } = req.query;

  let sql = `
    SELECT
      feedback_id,
      courier_date,
      invoice_date,
      pack_completed_at,
      courier_name,
      customer_name,
      rep_name,
      invoice_count,
      no_of_box,
      stock_received,
      stocks_ok,
      follow_up,
      feedback_time,
      issue_resolved_time
    FROM feedback
    WHERE 1=1
  `;

  const params = [];

  if (status === "resolved") {
    sql += ` AND issue_resolved_time IS NOT NULL`;
  } else if (status === "all") {
    // no filter
  } else {
    // default pending
    sql += ` AND issue_resolved_time IS NULL`;
  }

  if (!isAdmin) {
    sql += ` AND TRIM(LOWER(rep_name)) = TRIM(LOWER(?))`;
    params.push(loginName);
  }

  if (customer) {
    sql += ` AND LOWER(customer_name) LIKE ?`;
    params.push(`%${String(customer).toLowerCase()}%`);
  }

  if (invoice_date) {
    sql += ` AND DATE(invoice_date) = ?`;
    params.push(invoice_date);
  }

  if (courier_date) {
    sql += ` AND DATE(courier_date) = ?`;
    params.push(courier_date);
  }

  sql += ` ORDER BY courier_date ASC, customer_name ASC`;

  db.query(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        message: "DB fetch failed",
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }
    return res.json(Array.isArray(rows) ? rows : []);
  });
});

app.post("/api/feedback/update", (req, res) => {
  const loginName = String(req.user?.username || req.user?.name || "").trim();
  if (!loginName) return res.status(401).json({ message: "Unauthorized" });
  const isAdmin = loginName.toLowerCase() === "admin";

  const { feedback_id, stock_received, stocks_ok, follow_up } = req.body;

  if (!feedback_id) {
    return res.status(400).json({ message: "feedback_id is required" });
  }

  const sr = stock_received; // expect 1/0/null
  const ok = stocks_ok;      // expect 1/0/null

const guardSql = !isAdmin
  ? ` AND TRIM(LOWER(rep_name)) = TRIM(LOWER(?))`
  : ``;

const guardParams = !isAdmin ? [loginName] : [];  

  // Decide final values
  // Normalize sr/ok to numbers or null
  const srVal = sr === 1 || sr === "1" || sr === true ? 1 : sr === 0 || sr === "0" || sr === false ? 0 : null;
  const okVal = ok === 1 || ok === "1" || ok === true ? 1 : ok === 0 || ok === "0" || ok === false ? 0 : null;

  // Rule: if sr=0 then ok should not be set
  const finalOk = srVal === 0 ? null : okVal;

  // follow_up rules
  let followUpText = follow_up ?? null;

  // If sr=1 and ok=1 -> close & follow_up not required
  const shouldClose = srVal === 1 && finalOk === 1;

  if (shouldClose) {
    followUpText = "NOT REQUIRED";
  }

  const updateSql = `
    UPDATE feedback
    SET
      stock_received = ?,
      stocks_ok = ?,
      follow_up = ?,
      feedback_time = NOW()
      ${shouldClose ? ", issue_resolved_time = NOW()" : ""}
    WHERE feedback_id = ?
    ${guardSql}
  `;

  const params = [srVal, finalOk, followUpText, feedback_id, ...guardParams];

  console.log("UPDATE user:", req.user, "loginName:", loginName, "isAdmin:", isAdmin);
  console.log("UPDATE params:", params);

  db.query(updateSql, params, (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "DB update failed",
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }
    if ((result?.affectedRows || 0) === 0) {
      return res.status(404).json({ message: "Not found or not allowed" });
    }
    return res.json({ message: shouldClose ? "Saved & Resolved" : "Saved" });
  });
});

app.get("/api/reports/staff-timeline", (req, res) => {
  const username = clean(req.query.username);
  const from = clean(req.query.from); // optional YYYY-MM-DD
  const to = clean(req.query.to);     // optional YYYY-MM-DD

  if (!username) {
    return res.status(400).json({ message: "username is required" });
  }

  const dateFilter =
    from && to
      ? `AND DATE(start_time) BETWEEN ? AND ?`
      : ``;

  const params = from && to ? [username, username, from, to] : [username, username];

  const sql = `
    SELECT
      start_time,
      end_time,
      action,
      customer_name,
      invoice_number,
      no_of_products,
      invoice_value,
      CASE
        WHEN end_time IS NULL THEN 'IN_PROGRESS'
        ELSE 'COMPLETED'
      END AS status,
      TIMESTAMPDIFF(
        MINUTE,
        start_time,
        COALESCE(end_time, NOW())
      ) AS duration_minutes
    FROM (
      -- Stock Take
      SELECT
        take_started_at AS start_time,
        take_completed_at AS end_time,
        'Take' AS action,
        customer_name,
        invoice_number,
        no_of_products,
        invoice_value
      FROM packing
      WHERE taken_by = ?
        AND take_started_at IS NOT NULL

      UNION ALL

      -- Stock Verify & Packed
      SELECT
        verify_started_at AS start_time,
        pack_completed_at AS end_time,
        'Verify' AS action,
        customer_name,
        invoice_number,
        no_of_products,
        invoice_value
      FROM packing
      WHERE packed_by = ?
        AND verify_started_at IS NOT NULL
    ) t
    WHERE 1=1
    ${dateFilter}
    ORDER BY start_time DESC
  `;

  db.query(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to fetch staff timeline",
        err,
      });
    }

    return res.status(200).json(rows || []);
  });
});


/* =========================
   YOUR EXISTING ROUTES
   (Purchase issues, collection, upload, stationary)
========================= */

// --- PURCHASE ISSUES ---
app.post("/addpurchaseissue", (req, res) => {
  const { recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to } =
    req.body;

  const sqlAdd =
    "INSERT INTO purchase_issues (recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

  db.query(
    sqlAdd,
    [recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to],
    (error, result) => {
      if (error) console.log(error);
      res.send(result);
    }
  );
});

app.post("/addcomment", (req, res) => {
  const { comment, recorded_by, recorded_date, issue_id } = req.body;
  const sqlAdd = "INSERT INTO comments (comment, recorded_by, recorded_date, issue_id) VALUES (?, ?, ?, ?)";
  db.query(sqlAdd, [comment, recorded_by, recorded_date, issue_id], (error, result) => res.send(result));
});

app.get("/getcomments/:pur_issue_id", (req, res) => {
  const sqlGet = "SELECT * FROM comments WHERE issue_id=?";
  db.query(sqlGet, [req.params.pur_issue_id], (error, result) => {
    if (error) console.log(error);
    res.send(result);
  });
});

app.get("/deleteissue/:id", (req, res) => {
  const { id } = req.params;
  const sqlDelete = "DELETE FROM purchase_issues WHERE pur_issue_id=?";
  db.query(sqlDelete, [id], (error) => console.log(error));
});

app.get("/getpurchaseissues/:id", (req, res) => {
  const { id } = req.params;
  const sqlGet = "SELECT * FROM purchase_issues WHERE pur_issue_id=?";
  db.query(sqlGet, [id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data[0]);
  });
});

app.put("/editpurchaseissue/:id", (req, res) => {
  const { id } = req.params;
  const { recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to } =
    req.body;

  const sqlGet =
    "UPDATE purchase_issues SET recorded_by=?, date_recorded=?, supplier_name=?, product_name=?, qty=?, issue=?, status=?, description=?, assigned_to=? WHERE pur_issue_id = ?";

  db.query(
    sqlGet,
    [recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to, id],
    (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data[0]);
    }
  );
});

// --- COLLECTION ---
app.get("/getcollections", (req, res) => {
  db.query("SELECT * FROM collection", (error, result) => res.send(result));
});

app.post("/addcollection", (req, res) => {
  const { recorded_by, date_recorded, customer_name, followup_date, status } = req.body;
  const sqlAdd =
    "INSERT INTO collection (recorded_by, date_recorded, customer_name, followup_date, status) VALUES (?, ?, ?, ?, ?)";
  db.query(sqlAdd, [recorded_by, date_recorded, customer_name, followup_date, status], (error, result) => {
    if (error) console.log(error);
    res.send(result);
  });
});

app.get("/deletecollection/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM collection WHERE col_id=?", [id], (error) => console.log(error));
});

app.get("/getcollection/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM collection WHERE col_id=?", [id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data[0]);
  });
});

app.put("/editcollection/:id", (req, res) => {
  const { id } = req.params;
  const { recorded_by, date_recorded, customer_name, followup_date, status } = req.body;
  const sqlGet =
    "UPDATE collection SET recorded_by=?, date_recorded=?, customer_name=?, followup_date=?, status=? WHERE col_id = ?";
  db.query(sqlGet, [recorded_by, date_recorded, customer_name, followup_date, status, id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data[0]);
  });
});

app.put("/editcollectionFollowUp/:id", (req, res) => {
  const { id } = req.params;
  const { followup_date } = req.body;
  db.query("UPDATE collection SET followup_date=? WHERE col_id = ?", [followup_date, id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data[0]);
  });
});

app.put("/editcollectionStatus/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.query("UPDATE collection SET status=? WHERE col_id = ?", [status, id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data[0]);
  });
});

app.post("/addcollectioncomment", (req, res) => {
  const { comment, recorded_by, recorded_date, col_id } = req.body;
  const sqlAdd = "INSERT INTO collection_comment (comment, recorded_by, recorded_date, col_id) VALUES (?, ?, ?, ?)";
  db.query(sqlAdd, [comment, recorded_by, recorded_date, col_id], (error, result) => {
    if (error) console.log(error);
    res.send(result);
  });
});

app.get("/getcollectioncomments/:pur_issue_id", (req, res) => {
  db.query("SELECT * FROM collection_comment WHERE col_id=?", [req.params.pur_issue_id], (error, result) => {
    if (error) console.log(error);
    res.send(result);
  });
});

// --- UPLOAD ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    return cb(null, "../grocery_client/src/upload");
  },
  filename: function (req, file, cb) {
    return cb(null, `${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  res.send(file);
});

// --- STATIONARY ---
app.get("/stationaries", (req, res) => {
  db.query("SELECT * FROM stationary", (error, result) => res.send(result));
});

app.get("/stationary/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM stationary WHERE stationary_id=?", [id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data[0]);
  });
});

app.post("/addstationary", (req, res) => {
  const { invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name } = req.body;
  const sqlAdd =
    "INSERT INTO stationary (invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name) VALUES (?, ?, ?, ?, ?)";
  db.query(sqlAdd, [invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name], (error, result) =>
    res.send(result)
  );
});

app.post("/deletestationary/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM stationary WHERE stationary_id=?", [id], (error) => console.log(error));
});

app.put("/editstationary/:id", (req, res) => {
  const { id } = req.params;
  const { invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name } = req.body;
  const sqlGet =
    "UPDATE stationary SET invoice_number=?, invoice_date=?, supplier_name=?, invoice_amnt=?, stationary_name=? WHERE stationary_id = ?";
  db.query(sqlGet, [invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name, id], (error, result) => {
    if (error) console.log(error);
    res.send(result);
  });
});

app.put("/editstationarypaid/:id", (req, res) => {
  const { id } = req.params;
  const { date_paid } = req.body;
  db.query("UPDATE stationary SET date_paid=? WHERE stationary_id = ?", [date_paid, id], (error, result) => {
    if (error) console.log(error);
    res.send(result);
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
