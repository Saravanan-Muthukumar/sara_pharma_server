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

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
const clean = (v) => (isBlank(v) ? "" : String(v).trim());


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

app.get("/", (req, res) => {
  res.send("Hello there! Api is working well");
});


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


app.get("/api/invoices/today", (req, res) => {
  const sql = `
    SELECT
      p.*,
      c.customer_name,
      c.rep_name,
      c.courier_name,
      c.city
    FROM packing p
    LEFT JOIN customers c
      ON c.customer_id = p.customer_id
    WHERE
      p.status IN ('TO_TAKE','TAKING','TO_VERIFY','VERIFYING')
      OR DATE(p.take_completed_at) = CURDATE()
      OR DATE(p.pack_completed_at) = CURDATE()
    ORDER BY p.updated_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to load invoices",
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }
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
    const st = (row.status);

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
    const st = (row.status);

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

app.get("/api/packing/pack-info", (req, res) => {
  const invoice_id = Number(req.query.invoice_id);
  if (!Number.isFinite(invoice_id) || invoice_id <= 0) {
    return res.status(400).json({ message: "invoice_id required" });
  }

  // 1) Find the clicked invoice (to get customer_id + invoice_number)
  const invoiceSql = `
    SELECT 
    p.invoice_id,
    p.invoice_number,
    p.customer_id,
    p.invoice_date,
    p.status,
    c.customer_name,
    c.courier_name
  FROM packing p
  LEFT JOIN customers c ON c.customer_id = p.customer_id
  WHERE p.invoice_id = ?
  `;

  db.query(invoiceSql, [invoice_id], (e1, rows1) => {
    if (e1) {
      return res.status(500).json({ message: "DB error", code: e1.code, sqlMessage: e1.sqlMessage });
    }
    if (!rows1?.length) return res.status(404).json({ message: "Invoice not found" });

    const inv = rows1[0];
    const customer_id = Number(inv.customer_id);

    if (!Number.isFinite(customer_id) || customer_id <= 0) {
      return res.status(400).json({ message: "Invoice missing customer_id" });
    }

    // 2) Get ALL invoice_numbers for SAME customer where invoice_date = TODAY
    const listSql = `
      SELECT invoice_number
      FROM packing
      WHERE customer_id = ?
        AND DATE(invoice_date) = CURDATE()
      ORDER BY invoice_number ASC
    `;

    db.query(listSql, [customer_id], (e2, rows2) => {
      if (e2) {
        return res.status(500).json({ message: "DB error", code: e2.code, sqlMessage: e2.sqlMessage });
      }

      const invoice_numbers = (rows2 || []).map((r) => String(r.invoice_number || "").trim()).filter(Boolean);
      const invoice_count = invoice_numbers.length;

      // 3) If feedback exists for same customer where pack_completed_at = TODAY, return its no_of_box/weight (for prefilling)
      const fbSql = `
        SELECT feedback_id, no_of_box, weight
        FROM feedback
        WHERE customer_id = ?
          AND DATE(pack_completed_at) = CURDATE()
        ORDER BY feedback_id DESC
        LIMIT 1
      `;

      db.query(fbSql, [customer_id], (e3, fbRows) => {
        if (e3) {
          return res.status(500).json({ message: "DB error", code: e3.code, sqlMessage: e3.sqlMessage });
        }

        const fb = fbRows?.[0] || null;

        return res.json({
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          customer_id,
          customer_name: inv.customer_name ?? null,
          courier_name: inv.courier_name ?? null,

          invoice_count,
          invoice_numbers,

          existing_no_of_box: fb?.no_of_box ?? null,
          existing_weight: fb?.weight ?? null,
        });
      });
    });
  });
});

app.post("/api/packing/mark-packed-with-feedback", (req, res) => {
  const invoice_id = Number(req.body.invoice_id);
  const username = clean(req.body.username);
  const no_of_box = Number(req.body.no_of_box);

  const weight =
    req.body.weight === "" || req.body.weight === null || req.body.weight === undefined
      ? null
      : Number(req.body.weight);

  if (!Number.isFinite(invoice_id) || invoice_id <= 0 || !username) {
    return res.status(400).json({ message: "invoice_id and username required" });
  }
  if (!Number.isInteger(no_of_box) || no_of_box < 0) {
    return res.status(400).json({ message: "no_of_box must be a non-negative integer" });
  }
  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
    return res.status(400).json({ message: "weight must be a non-negative number" });
  }

  db.beginTransaction((txErr) => {
    if (txErr) return res.status(500).json({ message: "TX start failed", txErr });

    // 1) Lock invoice row
    db.query(
      "SELECT * FROM packing WHERE invoice_id = ? FOR UPDATE",
      [invoice_id],
      (e1, rows) => {
        if (e1) return db.rollback(() => res.status(500).json({ message: "DB error", e1 }));
        if (!rows?.length) return db.rollback(() => res.status(404).json({ message: "Invoice not found" }));

        const inv = rows[0];
        const st = String(inv.status || "").trim();

        if (!canTransition(st, "PACKED")) {
          return db.rollback(() =>
            res.status(400).json({ message: `Invalid transition: ${inv.status} -> PACKED` })
          );
        }

        if (clean(inv.packed_by) !== username) {
          return db.rollback(() =>
            res.status(403).json({ message: "Only the staff who started verifying can mark packed." })
          );
        }

        const customer_id = Number(inv.customer_id);
        if (!Number.isFinite(customer_id) || customer_id <= 0) {
          return db.rollback(() => res.status(400).json({ message: "Invoice missing customer_id" }));
        }

        // 2) invoice_count from PACKING where invoice_date = TODAY
        const countSql = `
          SELECT COUNT(*) AS c
          FROM packing
          WHERE customer_id = ?
            AND DATE(invoice_date) = CURDATE()
        `;

        db.query(countSql, [customer_id], (e2, cRows) => {
          if (e2) return db.rollback(() => res.status(500).json({ message: "Count failed", e2 }));

          const invoice_count = Number(cRows?.[0]?.c || 0);

          // 3) Update this invoice to PACKED
          db.query(
            "UPDATE packing SET status='PACKED', pack_completed_at=NOW(), updated_at=NOW() WHERE invoice_id=?",
            [invoice_id],
            (e3) => {
              if (e3) return db.rollback(() => res.status(500).json({ message: "Packing update failed", e3 }));

              // 4) Feedback exists for same customer where pack_completed_at = TODAY?
              const findFeedbackSql = `
                SELECT feedback_id
                FROM feedback
                WHERE customer_id = ?
                  AND DATE(pack_completed_at) = CURDATE()
                ORDER BY feedback_id DESC
                LIMIT 1
              `;

              db.query(findFeedbackSql, [customer_id], (e4, fbRows) => {
                if (e4) return db.rollback(() => res.status(500).json({ message: "Feedback lookup failed", e4 }));

                const feedback_id = fbRows?.[0]?.feedback_id || null;

                const commitOk = (payload) =>
                  db.commit((eCommit) => {
                    if (eCommit) return db.rollback(() => res.status(500).json({ message: "Commit failed", eCommit }));
                    return res.json(payload);
                  });

                if (feedback_id) {
                  // ✅ UPDATE (no insert)
                  const updateFeedbackSql = `
                    UPDATE feedback
                    SET
                      no_of_box = ?,
                      weight = ?,
                      invoice_count = ?,
                      pack_completed_at = NOW()
                    WHERE feedback_id = ?
                  `;

                  db.query(updateFeedbackSql, [no_of_box, weight, invoice_count, feedback_id], (e5) => {
                    if (e5) return db.rollback(() => res.status(500).json({ message: "Feedback update failed", e5 }));
                    return commitOk({ ok: true, feedback_mode: "updated", feedback_id, invoice_count });
                  });
                } else {
                  // ✅ INSERT new
                  const insertFeedbackSql = `
                    INSERT INTO feedback
                      (invoice_date, customer_id, no_of_box, weight, pack_completed_at, invoice_count)
                    VALUES
                      (CURDATE(), ?, ?, ?, NOW(), ?)
                  `;

                  db.query(insertFeedbackSql, [customer_id, no_of_box, weight, invoice_count], (e6, ins) => {
                    if (e6) return db.rollback(() => res.status(500).json({ message: "Feedback insert failed", e6 }));
                    return commitOk({ ok: true, feedback_mode: "inserted", feedback_id: ins.insertId, invoice_count });
                  });
                }
              });
            }
          );
        });
      }
    );
  });
});


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
    const st = (row.status);

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


app.post("/api/packing/create", (req, res) => {
  const invoice_number = clean(req.body.invoice_number);
  const invoice_date = clean(req.body.invoice_date) || null;
  const no_of_products = Number(req.body.no_of_products);
  const invoice_value =
    req.body.invoice_value === "" || req.body.invoice_value === null || req.body.invoice_value === undefined
      ? null
      : Number(req.body.invoice_value);

  const customer_id = Number(req.body.customer_id);
  const rep_name = clean(req.body.rep_name) || null;
  const courier_name = clean(req.body.courier_name);
  const created_by = clean(req.body.created_by) || null;

  if (!invoice_number || !Number.isFinite(no_of_products) || no_of_products <= 0 || !Number.isFinite(customer_id) || customer_id <= 0 || !courier_name) {
    return res.status(400).json({
      message: "invoice_number, no_of_products, customer_id, courier_name are required",
    });
  }

  const sql = `
    INSERT INTO packing
      (invoice_number, invoice_date, no_of_products, invoice_value,
       customer_id, rep_name, courier_name,
       status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'TO_TAKE', ?, NOW(), NOW())
  `;

  db.query(
    sql,
    [invoice_number, invoice_date, no_of_products, invoice_value, customer_id, rep_name, courier_name, created_by],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Invoice number already exists" });
        return res.status(500).json({ message: "DB insert failed", code: err.code, sqlMessage: err.sqlMessage });
      }
      return res.status(200).json({ ok: true, invoice_id: result.insertId });
    }
  );
});

// ✅ Admin Edit - Get invoice by invoice_number
app.get("/api/packing/edit/:invoice_number", (req, res) => {
  const invoice_number = clean(req.params.invoice_number);

  if (!invoice_number) {
    return res.status(400).json({ message: "invoice_number required" });
  }

  const sql = `
    SELECT
      p.invoice_id,
      p.invoice_number,
      p.invoice_date,
      p.no_of_products,
      p.invoice_value,
      p.customer_id,
      p.status,
      p.created_at,
      p.updated_at,
      p.taken_by,
      p.packed_by,
      p.take_started_at,
      p.take_completed_at,
      p.verify_started_at,
      p.pack_completed_at,

      c.customer_name,
      c.city,
      c.rep_name,
      c.courier_name

    FROM packing p
    LEFT JOIN customers c
      ON c.customer_id = p.customer_id

    WHERE UPPER(TRIM(p.invoice_number)) = UPPER(TRIM(?))
    LIMIT 1
  `;

  db.query(sql, [invoice_number], (err, rows) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to fetch invoice",
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    return res.status(200).json(rows[0]);
  });
});

// PUT /api/packing/edit/:invoice_id
app.put("/api/packing/edit/:invoice_id", (req, res) => {
  const invoice_id = Number(req.params.invoice_id);
  if (!Number.isFinite(invoice_id) || invoice_id <= 0)
    return res.status(400).json({ message: "invalid invoice_id" });

  const invoice_number = clean(req.body.invoice_number)?.toUpperCase();
  const invoice_date = clean(req.body.invoice_date) || null;
  const no_of_products = Number(req.body.no_of_products);
  const invoice_value =
    req.body.invoice_value === "" || req.body.invoice_value == null
      ? null
      : Number(req.body.invoice_value);
  const customer_id = Number(req.body.customer_id);

  if (!invoice_number)
    return res.status(400).json({ message: "invoice_number required" });
  if (!Number.isInteger(no_of_products) || no_of_products <= 0)
    return res.status(400).json({ message: "invalid no_of_products" });
  if (invoice_value !== null && invoice_value < 0)
    return res.status(400).json({ message: "invalid invoice_value" });
  if (!Number.isFinite(customer_id) || customer_id <= 0)
    return res.status(400).json({ message: "invalid customer_id" });

  const sql = `
    UPDATE packing
    SET invoice_number=?, invoice_date=?, no_of_products=?,
        invoice_value=?, customer_id=?, updated_at=NOW()
    WHERE invoice_id=?`;

  db.query(
    sql,
    [invoice_number, invoice_date, no_of_products, invoice_value, customer_id, invoice_id],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res.status(409).json({ message: "Invoice number already exists" });
        return res.status(500).json({ message: "Update failed" });
      }
      if (!result.affectedRows)
        return res.status(404).json({ message: "Invoice not found" });

      return res.json({ ok: true, message: "Update successful" });
    }
  );
});

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
  const sql = `
    SELECT
      f.feedback_id,
      f.customer_id,
      f.invoice_date,
      f.pack_completed_at,
      

      c.customer_name,
      c.city,
      c.rep_name,
      c.courier_name,

      f.invoice_count,
      f.no_of_box,
      f.stock_received,
      f.stocks_ok,
      f.follow_up,
      f.feedback_time,
      f.issue_resolved_time,
      f.courier_date,
      f.weight
    FROM feedback f
    LEFT JOIN customers c
      ON c.customer_id = f.customer_id
    WHERE DATE(f.pack_completed_at) = CURDATE()
    ORDER BY
      f.pack_completed_at ASC,
      c.customer_name ASC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to load feedback",
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }

    return res.status(200).json({
      mode: "view",
      rows: rows || [],
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
  const username = String(req.query.username || "").trim();
  if (!username) return res.status(400).json({ message: "username required" });

  const isAdmin = username.toLowerCase() === "admin";
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

  if (status === "resolved") sql += ` AND issue_resolved_time IS NOT NULL`;
  else if (status !== "all") sql += ` AND issue_resolved_time IS NULL`;

  if (!isAdmin) {
    sql += ` AND TRIM(LOWER(rep_name)) = TRIM(LOWER(?))`;
    params.push(username);
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
  const username = String(req.body.username || "").trim();
  if (!username) return res.status(400).json({ message: "username required" });

  const isAdmin = username.toLowerCase() === "admin";
  const { feedback_id, stock_received, stocks_ok, follow_up } = req.body;

  if (!feedback_id) return res.status(400).json({ message: "feedback_id is required" });

  const srVal =
    stock_received === 1 || stock_received === "1" || stock_received === true
      ? 1
      : stock_received === 0 || stock_received === "0" || stock_received === false
      ? 0
      : null;

  const okVal =
    stocks_ok === 1 || stocks_ok === "1" || stocks_ok === true
      ? 1
      : stocks_ok === 0 || stocks_ok === "0" || stocks_ok === false
      ? 0
      : null;

  const finalOk = srVal === 0 ? null : okVal;

  let followUpText = follow_up ?? null;
  const shouldClose = srVal === 1 && finalOk === 1;
  if (shouldClose) followUpText = "NOT REQUIRED";

  const guardSql = !isAdmin
    ? ` AND TRIM(LOWER(rep_name)) = TRIM(LOWER(?))`
    : ``;

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

  const params = !isAdmin
    ? [srVal, finalOk, followUpText, feedback_id, username]
    : [srVal, finalOk, followUpText, feedback_id];

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

  let dateFilter = "";
  let params = [username, username];

  // ✅ DATE LOGIC
  if (from && to) {
    dateFilter = `AND DATE(start_time) BETWEEN ? AND ?`;
    params.push(from, to);
  } else {
    // ✅ DEFAULT = TODAY
    dateFilter = `AND DATE(start_time) = CURDATE()`;
  }

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
