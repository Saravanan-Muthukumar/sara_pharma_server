const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require ('body-parser');
const cors = require ('cors');
const mysql = require('mysql2');
const cookieParser = require ("cookie-parser");
const bcrypt = require ("bcryptjs");
const jwt = require ("jsonwebtoken");
const multer = require('multer');
 
const host = process.env.HOST;
const user = process.env.USER;
const password = process.env.PASSWORD;
const database = process.env.DATABASE;

const db = mysql.createConnection({
    host: process.env.HOST || 'sara-pharma-do-user-15769670-0.c.db.ondigitalocean.com',
    user: process.env.USER || 'doadmin1',
    password: process.env.PASSWORD || 'AVNS_S5lEfEbPAYykuTUXOdE',
    database: process.env.DATABASE || 'sara_pharma',
    port:process.env.DB_PORT || '25060'
})

// const db = mysql.createConnection({
//     host: process.env.HOST,
//     user: process.env.USER,
//     password: process.env.PASSWORD,
//     database: process.env.DATABASE,
//     port: process.env.DB_PORT
// })

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: true}));

const PORT = process.env.PORT ;
console.log(process.env.HOST)
console.log(process.env.USER)
console.log(process.env.PASSWORD)
console.log(process.env.DATABASE)

app.get("/", (req,res)=> {
    res.send("Hello there! Api is working well1")
})

app.post('/register', (req, res) =>{

  // CHECK EXISTING USER
  console.log(req.body)
  const q = "SELECT * FROM users WHERE email = ? OR username = ?";
  db.query(q, [req.body.email, req.body.username], (err, data)=>{
      if(err) return res.status(500).json(err);
      if(data.length) return res.status(409).json("User already existss!");

      // HASH 
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(req.body.password, salt);

      const q = "INSERT INTO users (`username`, `email`, `password`) VALUES (?);"
      const values = [req.body.username, req.body.email, hash];
      db.query(q, [values], (err, data)=>{
          if(err) return res.status(500).json(err);
          return res.status(200).json("User created!");
      });
  });
});

app.post('/login1', (req, res) => {

    console.log("req submitted to login")
    console.log(req.body);
    //CHECK USER
  
    const q = "SELECT * FROM users WHERE username = ?";
  
    db.query(q, [req.body.username], (err, data) => {
      if (err) return res.status(500).json(err);
      if (data.length === 0) return res.status(404).json("User not found!");
  
      //Check password
      const isPasswordCorrect = bcrypt.compareSync(
        req.body.password,
        data[0].password
      );
  
      if (!isPasswordCorrect)
        return res.status(400).json("Wrong username or password!");
  
      const token = jwt.sign({ id: data[0].id }, "jwtkey");
      const { password, ...other } = data[0];
      console.log("other is", other)
      console.log(token);
  
      res
        
        .cookie("access_token", token, {
          httpOnly: true,
        })
        .status(200)
        .json(other);
    });
    
  });

app.post('/logout', (req, res) =>{
  res.clearCookie("access_token",{
    sameSite: "none",
    secure: true
  }).status(200).json("User has been logged out")
})
  

app.get("/api/get", (req, res)=>{
    console.log("request submitted")
    const sqlGet= "SELECT * FROM users";
    db.query(sqlGet, (error, result)=>{
        console.log(result);
        res.send(result)
    })
})

// ==============================
// NEW PACKING API (NEW STATUSES)
// Add this BELOW app.use(...) and ABOVE app.listen(...)
// ==============================

const STATUSES = ["TO_TAKE", "TAKING", "TO_VERIFY", "VERIFYING", "PACKED"];

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

// ✅ GET /api/packing  (main list endpoint)
app.get("/api/packing", (req, res) => {
  const date = clean(req.query.date); // YYYY-MM-DD
  const status = clean(req.query.status); // TO_TAKE / ... / ALL
  const search = clean(req.query.search);
  const scope = clean(req.query.scope); // mine | all
  const username = clean(req.query.username);

  let sql = "SELECT * FROM packing WHERE 1=1";
  const params = [];

  if (date) {
    // filter by invoice_date primarily (recommended), fallback to created_at
    sql += " AND (invoice_date = ? OR DATE(created_at) = ?)";
    params.push(date, date);
  }

  if (status && status !== "ALL") {
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status filter" });
    }
    sql += " AND status = ?";
    params.push(status);
  }

  if (search) {
    sql += " AND (invoice_number LIKE ? OR customer_name LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  // scope=mine => only invoices I touched (taken_by or packed_by)
  if (scope === "mine") {
    if (!username) return res.status(400).json({ message: "username required for scope=mine" });
    sql += " AND (taken_by = ? OR packed_by = ?)";
    params.push(username, username);
  }

  sql += " ORDER BY created_at DESC";

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// ✅ GET /api/me/job  (my active invoices: TAKING by me OR VERIFYING by me)
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

// ✅ GET /api/me/bills-to-take  (TO_TAKE)
app.get("/api/me/bills-to-take", (req, res) => {
  const date = clean(req.query.date);

  let q = "SELECT * FROM packing WHERE status = 'TO_TAKE'";
  const params = [];

  if (date) {
    q += " AND (invoice_date = ? OR DATE(created_at) = ?)";
    params.push(date, date);
  }

  q += " ORDER BY created_at DESC";

  db.query(q, params, (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// ✅ GET /api/me/bills-to-verify  (TO_VERIFY but not taken_by me)
app.get("/api/me/bills-to-verify", (req, res) => {
  const date = clean(req.query.date);
  const username = clean(req.query.username);
  if (!username) return res.status(400).json({ message: "username required" });

  let q = "SELECT * FROM packing WHERE status = 'TO_VERIFY' AND (taken_by IS NULL OR taken_by <> ?)";
  const params = [username];

  if (date) {
    q += " AND (invoice_date = ? OR DATE(created_at) = ?)";
    params.push(date, date);
  }

  q += " ORDER BY created_at DESC";

  db.query(q, params, (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// ✅ POST /api/packing/start-taking  TO_TAKE -> TAKING
app.post("/api/packing/start-taking", async (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);

  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  try {
    const active = await getActiveCount(username);
    if (active >= 2) {
      return res.status(403).json({ message: "You can work only 2 invoices at a time." });
    }
  } catch (e) {
    return res.status(500).json(e);
  }

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];
    if (row.status !== "TO_TAKE") {
      return res.status(400).json({ message: `Invalid status: ${row.status}` });
    }

    db.query(
      `
      UPDATE packing
      SET status='TAKING', taken_by=?, take_started_at=NOW(), updated_at=NOW()
      WHERE invoice_id=?
      `,
      [username, invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ✅ POST /api/packing/mark-taken  TAKING -> TO_VERIFY  (only taken_by can complete)
app.post("/api/packing/mark-taken", (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);

  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];

    if (!canTransition(row.status, "TO_VERIFY")) {
      return res.status(400).json({ message: `Invalid transition: ${row.status} -> TO_VERIFY` });
    }

    if (clean(row.taken_by) !== username) {
      return res.status(403).json({ message: "Only the staff who started taking can mark taken." });
    }

    db.query(
      `
      UPDATE packing
      SET status='TO_VERIFY', take_completed_at=NOW(), updated_at=NOW()
      WHERE invoice_id=?
      `,
      [invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ✅ POST /api/packing/start-verify  TO_VERIFY -> VERIFYING (taken_by cannot verify)
app.post("/api/packing/start-verify", async (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);

  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  try {
    const active = await getActiveCount(username);
    if (active >= 2) {
      return res.status(403).json({ message: "You can work only 2 invoices at a time." });
    }
  } catch (e) {
    return res.status(500).json(e);
  }

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];

    if (!canTransition(row.status, "VERIFYING")) {
      return res.status(400).json({ message: `Invalid transition: ${row.status} -> VERIFYING` });
    }

    // taken_by cannot be packed_by
    if (clean(row.taken_by) && clean(row.taken_by) === username) {
      return res.status(403).json({ message: "The staff who took stock cannot verify & pack the same invoice." });
    }

    db.query(
      `
      UPDATE packing
      SET status='VERIFYING', packed_by=?, verify_started_at=NOW(), updated_at=NOW()
      WHERE invoice_id=?
      `,
      [username, invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ✅ POST /api/packing/mark-packed  VERIFYING -> PACKED (only packed_by can complete)
app.post("/api/packing/mark-packed", (req, res) => {
  const invoice_id = req.body.invoice_id;
  const username = clean(req.body.username);

  if (!invoice_id || !username) return res.status(400).json({ message: "invoice_id and username required" });

  db.query("SELECT * FROM packing WHERE invoice_id = ?", [invoice_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows?.length) return res.status(404).json({ message: "Invoice not found" });

    const row = rows[0];

    if (!canTransition(row.status, "PACKED")) {
      return res.status(400).json({ message: `Invalid transition: ${row.status} -> PACKED` });
    }

    if (clean(row.packed_by) !== username) {
      return res.status(403).json({ message: "Only the staff who started verifying can mark packed." });
    }

    db.query(
      `
      UPDATE packing
      SET status='PACKED', pack_completed_at=NOW(), updated_at=NOW()
      WHERE invoice_id=?
      `,
      [invoice_id],
      (e2) => {
        if (e2) return res.status(500).json(e2);
        return res.status(200).json({ ok: true });
      }
    );
  });
});

// ==============================
// NEW PACKING LIST API
// ==============================
app.get("/api/packing", (req, res) => {
  const { date, status, search, scope, username } = req.query;

  let sql = "SELECT * FROM packing WHERE 1=1";
  const params = [];

  // Date filter (preferred: invoice_date, fallback: created_at)
  if (date) {
    sql += " AND (invoice_date = ? OR DATE(created_at) = ?)";
    params.push(date, date);
  }

  // Status filter
  if (status && status !== "ALL") {
    sql += " AND status = ?";
    params.push(status);
  }

  // Search filter
  if (search) {
    sql += " AND (invoice_number LIKE ? OR customer_name LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  // Scope filter (mine / all)
  if (scope === "mine" && username) {
    sql += " AND (taken_by = ? OR packed_by = ?)";
    params.push(username, username);
  }

  sql += " ORDER BY created_at DESC";

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows || []);
  });
});

// BACKEND REQUIRED (Express) — add these endpoints for Customer CRUD
// Put above app.listen(...)

app.get("/api/customers", (req, res) => {
  const q = String(req.query.q || "").trim();
  let sql = "SELECT customer_id, customer_name, city, rep_name FROM customers";
  const params = [];

  if (q) {
    sql += " WHERE customer_name LIKE ? OR city LIKE ? OR rep_name LIKE ?";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
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

  if (!customer_name) return res.status(400).json({ message: "customer_name is required" });

  const sql =
    "INSERT INTO customers (customer_name, city, rep_name) VALUES (?, ?, ?)";

  db.query(sql, [customer_name, city, rep_name], (err, result) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json({ ok: true, customer_id: result.insertId });
  });
});

app.put("/api/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  const customer_name = String(req.body.customer_name || "").trim();
  const city = String(req.body.city || "").trim() || null;
  const rep_name = String(req.body.rep_name || "").trim() || null;

  if (!id) return res.status(400).json({ message: "invalid id" });
  if (!customer_name) return res.status(400).json({ message: "customer_name is required" });

  const sql =
    "UPDATE customers SET customer_name=?, city=?, rep_name=? WHERE customer_id=?";

  db.query(sql, [customer_name, city, rep_name, id], (err) => {
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

app.post("/addpurchaseissue", (req, res)=>{
  const { recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to } = req.body;
  const sqlAdd = "INSERT INTO purchase_issues (recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
  db.query(sqlAdd, [recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to], (error, result)=>{
      if (error) {
        console.log(error)
    }
      res.send(result);
  })
})

app.post("/addcomment", (req, res)=>{
  const { comment, recorded_by, recorded_date, issue_id } = req.body;
  const sqlAdd = "INSERT INTO comments (comment, recorded_by, recorded_date, issue_id) VALUES (?, ?, ?, ?)";
  db.query(sqlAdd, [comment, recorded_by, recorded_date, issue_id], (error, result)=>{
      res.send(result);
  })
})

app.get("/getcomments/:pur_issue_id", (req, res)=>{
  const sqlGet= "SELECT * FROM comments WHERE issue_id=?";
  db.query(sqlGet, [req.params.pur_issue_id], (error, result)=>{
    if (error) {
      console.log(error)
  }
    res.send(result);
})
})

app.get("/deleteissue/:id", (req, res)=>{
  const {id} = req.params;
  // const id = 2;
  console.log("id to delete", id);
  const sqlDelete = "DELETE FROM purchase_issues WHERE pur_issue_id=?";
  db.query(sqlDelete, [id], (error, result)=>{
      console.log(error);
  })
})

app.get("/getpurchaseissues/:id", (req, res)=>{
  const {id} = req.params;
  console.log("id to get purchase issue", id);
  const sqlGet= "SELECT * FROM purchase_issues WHERE pur_issue_id=?";
  db.query(sqlGet, [id], (err, data)=>{
    if (err) return res.status(500).json(err);
    console.log("post", data[0]);
    return res.status(200).json(data[0]);
  })
})

app.put("/editpurchaseissue/:id", (req, res)=>{
  const { id } = req.params;
  const  {recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to} = req.body;
  console.log("Data to edit", recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to)
  const sqlGet= "UPDATE purchase_issues SET recorded_by=?, date_recorded=?, supplier_name=?, product_name=?, qty=?, issue=?, status=?, description=?, assigned_to=? WHERE pur_issue_id = ?";
  db.query(sqlGet, [recorded_by, date_recorded, supplier_name, product_name, qty, issue, status, description, assigned_to, id], (err, data)=>{
    if (err) return res.status(500).json(err);
    console.log("post", data[0]);
    return res.status(200).json(data[0]);
  });
})

app.get("/getcollections", (req, res)=>{
  const sqlGet= "SELECT * FROM collection";
  db.query(sqlGet, (error, result)=>{
      res.send(result)
  })
})

app.post("/addcollection", (req, res)=>{
  const { recorded_by, date_recorded, customer_name, followup_date, status } = req.body;
  const sqlAdd = "INSERT INTO collection (recorded_by, date_recorded, customer_name, followup_date, status) VALUES (?, ?, ?, ?, ?)";
  db.query(sqlAdd, [recorded_by, date_recorded, customer_name, followup_date, status], (error, result)=>{
    if (error) {
      console.log(error)
  }
    res.send(result);
})
})

app.get("/deletecollection/:id", (req, res)=>{
  const {id} = req.params;
  // const id = 2;
  console.log("id to delete", id);
  const sqlDelete = "DELETE FROM collection WHERE col_id=?";
  db.query(sqlDelete, [id], (error, result)=>{
      console.log(error);
  })
})

app.get ('/getcollection/:id', (req, res) =>{
  const {id} = req.params;
  console.log("id to get collection is ", id)
  const q = "SELECT * FROM collection WHERE col_id=?";
  db.query(q, [id], (err, data)=>{
      if (err) return res.status(500).json(err);
      console.log("collection", data[0]);
      return res.status(200).json(data[0]);
  })
})

app.put("/editcollection/:id", (req, res)=>{
  const { id } = req.params;
  const  {recorded_by, date_recorded, customer_name, followup_date, status} = req.body;
  console.log("Data to edit", recorded_by, date_recorded, customer_name, followup_date, status, id)
  const sqlGet= "UPDATE collection SET recorded_by=?, date_recorded=?, customer_name=?, followup_date=?, status=? WHERE col_id = ?";
  db.query(sqlGet, [recorded_by, date_recorded, customer_name, followup_date, status, id], (err, data)=>{
    if (err) return res.status(500).json(err);
    console.log("post", data[0]);
    return res.status(200).json(data[0]);
  });
})
app.put("/editcollectionFollowUp/:id", (req, res)=>{
  const { id } = req.params;
  const  {followup_date} = req.body;
  console.log("Data to editFollowup", followup_date, id)
  const sqlGet= "UPDATE collection SET followup_date=? WHERE col_id = ?";
  db.query(sqlGet, [followup_date, id], (err, data)=>{
    if (err) return res.status(500).json(err);
    console.log("post", data[0]);
    return res.status(200).json(data[0]);
  });
})
app.put("/editcollectionStatus/:id", (req, res)=>{
  const { id } = req.params;
  const  {status} = req.body;
  console.log("Data to editFollowup", status, id)
  const sqlGet= "UPDATE collection SET status=? WHERE col_id = ?";
  db.query(sqlGet, [status, id], (err, data)=>{
    if (err) return res.status(500).json(err);
    console.log("post", data[0]);
    return res.status(200).json(data[0]);
  });
})

app.post("/addcollectioncomment", (req, res)=>{
  const { comment, recorded_by, recorded_date, col_id } = req.body;
  const sqlAdd = "INSERT INTO collection_comment (comment, recorded_by, recorded_date, col_id) VALUES (?, ?, ?, ?)";
  db.query(sqlAdd, [comment, recorded_by, recorded_date, col_id], (error, result)=>{
    if (error) {
      console.log(error)
  }
    res.send(result);
})
})


app.get("/getcollectioncomments/:pur_issue_id", (req, res)=>{
  const sqlGet= "SELECT * FROM collection_comment WHERE col_id=?";
  db.query(sqlGet, [req.params.pur_issue_id], (error, result)=>{
    if (error) {
      console.log(error)
  }
    res.send(result);
})
})

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    return cb(null, "../grocery_client/src/upload")
  },
  filename: function (req, file, cb) {
    return cb(null, `${Date.now()}_${file.originalname}`)
  }
})

const upload = multer({storage})

app.post('/upload', upload.single('file'), (req, res) => {
  console.log(req.body)
  console.log(req.file)
  console.log(req.file.filename)
  const file = req.file;
  res.send(file)
})


app.get("/stationaries", (req, res)=>{
  console.log("Req received to fetch products")
  const query = "SELECT * FROM stationary";

  db.query(query, (error, result)=>{
      console.log(result);
      res.send(result)
  })
})

app.get ('/stationary/:id', (req, res) =>{
  const {id} = req.params;
  console.log("id to get stationary is ", id)
  const q = "SELECT * FROM stationary WHERE stationary_id=?";
  db.query(q, [id], (err, data)=>{
      if (err) return res.status(500).json(err);
      console.log("post", data[0]);
      return res.status(200).json(data[0]);
  })
})

app.post("/addstationary", (req, res)=>{
  const { invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name } = req.body;
  console.log(invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name);
  const sqlAdd = "INSERT INTO stationary (invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name) VALUES (?, ?, ?, ?, ?)";
  db.query(sqlAdd, [invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name], (error, result)=>{
      res.send(result);
  })
})

app.post("/deletestationary/:id", (req, res)=>{
  const {id} = req.params;
  // const id = 2;
  console.log("id to delete", id);
  const sqlDelete = "DELETE FROM stationary WHERE stationary_id=?";
  db.query(sqlDelete, [id], (error, result)=>{
      console.log(error);
  })
})

app.put("/editstationary/:id", (req, res)=>{
  const { id } = req.params;
  const  {invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name } = req.body;
  console.log("Data to edit", invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name)
  const sqlGet= "UPDATE stationary SET invoice_number=?, invoice_date=?, supplier_name=?, invoice_amnt=?, stationary_name=? WHERE stationary_id = ?";
  db.query(sqlGet, [invoice_number, invoice_date, supplier_name, invoice_amnt, stationary_name, id], (error, result)=>{
      if (error) {
          console.log(error)
      }
      res.send(result)
  });
})
app.put("/editstationarypaid/:id", (req, res)=>{
  const { id } = req.params;
  const  {date_paid } = req.body;
  console.log("Data to edit date", date_paid)
  const sqlGet= "UPDATE stationary SET date_paid=? WHERE stationary_id = ?";
  db.query(sqlGet, [date_paid, id], (error, result)=>{
      if (error) {
          console.log(error)
      }
      res.send(result)
  });
})


app.listen(PORT, () => console.log(`Sever is runninggg port ${PORT} ...`));
