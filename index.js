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

app.post("/packing/save", (req, res) => {
  const {
    invoice_id,
    invoice_number,
    no_of_products,
    invoice_value,
    customer_name,
    courier_name,
    status,
    taken_by,
    packed_by,
  } = req.body;

  const isBlank = (value) =>
    value === undefined || value === null || String(value).trim() === "";

  const toTrimOrNull = (value) => (isBlank(value) ? null : String(value).trim());

  const canTransition = (fromStatus, toStatus) => {
    if (!toStatus || fromStatus === toStatus) return true;

    const allowedTransitions = {
      TAKING_IN_PROGRESS: ["TAKING_DONE"],
      TAKING_DONE: ["VERIFY_IN_PROGRESS"],
      VERIFY_IN_PROGRESS: ["COMPLETED"],
      COMPLETED: [],
    };

    return (allowedTransitions[fromStatus] || []).includes(toStatus);
  };

  // =========================
  // CREATE (no invoice_id)
  // =========================
  if (!invoice_id) {
    if (
      isBlank(invoice_number) ||
      isBlank(no_of_products) ||
      isBlank(customer_name) ||
      isBlank(courier_name) ||
      isBlank(taken_by)
    ) {
      return res
        .status(400)
        .json(
          "invoice_number, no_of_products, customer_name, courier_name, taken_by are required"
        );
    }

    const finalStatus =
      status && !isBlank(status) ? String(status).trim() : "TAKING_IN_PROGRESS";

    const insertSql = `
      INSERT INTO packing
        (invoice_number, no_of_products, invoice_value, customer_name, courier_name,
         status, taken_by, take_started_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `;

    const finalInvoiceValue =
      invoice_value === "" || invoice_value === undefined || invoice_value === null
        ? null
        : Number(invoice_value);

    db.query(
      insertSql,
      [
        String(invoice_number).trim(),
        Number(no_of_products),
        finalInvoiceValue,
        String(customer_name).trim(),
        String(courier_name).trim(),
        finalStatus,
        String(taken_by).trim(),
      ],
      (insertError, insertResult) => {
        if (insertError) {
          if (insertError.code === "ER_DUP_ENTRY")
            return res.status(409).json("Invoice already exists");
          return res.status(500).json(insertError);
        }

        db.query(
          "SELECT * FROM packing WHERE invoice_id = ?",
          [insertResult.insertId],
          (selectError, rows) => {
            if (selectError) return res.status(500).json(selectError);
            return res.status(200).json({ action: "created", data: rows[0] });
          }
        );
      }
    );

    return;
  }

  // =========================
  // UPDATE / TRANSITIONS
  // =========================
  db.query(
    "SELECT * FROM packing WHERE invoice_id = ?",
    [invoice_id],
    (readError, rows) => {
      if (readError) return res.status(500).json(readError);
      if (!rows.length) return res.status(404).json("Invoice not found");

      const currentRow = rows[0];

      // status can be omitted for edit-only requests
      const nextStatus =
        status === undefined || isBlank(status)
          ? currentRow.status
          : String(status).trim();

      if (status !== undefined && !canTransition(currentRow.status, nextStatus)) {
        return res
          .status(400)
          .json(`Invalid status transition: ${currentRow.status} -> ${nextStatus}`);
      }

      // -------------------------
      // EDIT (no status provided)
      // -------------------------
      if (status === undefined) {
        const updateSql = `
          UPDATE packing
          SET
            invoice_number = COALESCE(?, invoice_number),
            no_of_products = COALESCE(?, no_of_products),
            invoice_value  = ?,
            customer_name  = COALESCE(?, customer_name),
            courier_name   = COALESCE(?, courier_name),
            taken_by       = COALESCE(?, taken_by),
            updated_at     = NOW()
          WHERE invoice_id = ?
        `;

        const finalInvoiceValue =
          invoice_value === undefined
            ? currentRow.invoice_value
            : invoice_value === "" || invoice_value === null
            ? null
            : Number(invoice_value);

        const safeTakenBy = toTrimOrNull(taken_by);

        db.query(
          updateSql,
          [
            invoice_number !== undefined ? String(invoice_number).trim() : null,
            no_of_products !== undefined ? Number(no_of_products) : null,
            finalInvoiceValue,
            customer_name !== undefined ? String(customer_name).trim() : null,
            courier_name !== undefined ? String(courier_name).trim() : null,
            safeTakenBy,
            invoice_id,
          ],
          (updateError) => {
            if (updateError) {
              if (updateError.code === "ER_DUP_ENTRY")
                return res.status(409).json("Invoice number already exists");
              return res.status(500).json(updateError);
            }

            db.query(
              "SELECT * FROM packing WHERE invoice_id = ?",
              [invoice_id],
              (selectError, updatedRows) => {
                if (selectError) return res.status(500).json(selectError);
                return res
                  .status(200)
                  .json({ action: "updated", data: updatedRows[0] });
              }
            );
          }
        );

        return;
      }

      // -------------------------
      // TRANSITIONS
      // -------------------------

      // ✅ TAKING_IN_PROGRESS -> TAKING_DONE
      if (nextStatus === "TAKING_DONE") {
        const safeTakenBy = toTrimOrNull(taken_by);

        // IMPORTANT FIX:
        // Prefer provided taken_by (if non-blank), otherwise keep existing.
        const updateSql = `
          UPDATE packing
          SET
            status = 'TAKING_DONE',
            taken_by = CASE
              WHEN ? IS NULL THEN taken_by
              ELSE ?
            END,
            take_completed_at = NOW(),
            updated_at = NOW()
          WHERE invoice_id = ?
        `;

        db.query(updateSql, [safeTakenBy, safeTakenBy, invoice_id], (updateError) => {
          if (updateError) return res.status(500).json(updateError);

          db.query(
            "SELECT * FROM packing WHERE invoice_id = ?",
            [invoice_id],
            (selectError, updatedRows) => {
              if (selectError) return res.status(500).json(selectError);
              return res
                .status(200)
                .json({ action: "taking_completed", data: updatedRows[0] });
            }
          );
        });

        return;
      }

      // ✅ TAKING_DONE -> VERIFY_IN_PROGRESS
      if (nextStatus === "VERIFY_IN_PROGRESS") {
        const safePackedBy = toTrimOrNull(packed_by);
        if (!safePackedBy) return res.status(400).json("packed_by is required");

        const updateSql = `
          UPDATE packing
          SET
            status = 'VERIFY_IN_PROGRESS',
            packed_by = ?,
            verify_started_at = NOW(),
            updated_at = NOW()
          WHERE invoice_id = ?
        `;

        db.query(updateSql, [safePackedBy, invoice_id], (updateError) => {
          if (updateError) return res.status(500).json(updateError);

          db.query(
            "SELECT * FROM packing WHERE invoice_id = ?",
            [invoice_id],
            (selectError, updatedRows) => {
              if (selectError) return res.status(500).json(selectError);
              return res
                .status(200)
                .json({ action: "verify_started", data: updatedRows[0] });
            }
          );
        });

        return;
      }

      // ✅ VERIFY_IN_PROGRESS -> COMPLETED
      if (nextStatus === "COMPLETED") {
        const updateSql = `
          UPDATE packing
          SET
            status = 'COMPLETED',
            pack_completed_at = NOW(),
            updated_at = NOW()
          WHERE invoice_id = ?
        `;

        db.query(updateSql, [invoice_id], (updateError) => {
          if (updateError) return res.status(500).json(updateError);

          db.query(
            "SELECT * FROM packing WHERE invoice_id = ?",
            [invoice_id],
            (selectError, updatedRows) => {
              if (selectError) return res.status(500).json(selectError);
              return res
                .status(200)
                .json({ action: "packing_completed", data: updatedRows[0] });
            }
          );
        });

        return;
      }

      return res.status(400).json("Unsupported status update");
    }
  );
});

app.get("/packing", (req, res) => {
  const { date } = req.query;

  const qBase = "SELECT * FROM packing";
  const qOrder = " ORDER BY created_at DESC";

  if (date) {
    const q = `${qBase} WHERE DATE(created_at) = ? ${qOrder}`;
    db.query(q, [date], (err, rows) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(rows);
    });
    return;
  }

  db.query(`${qBase} ${qOrder}`, (err, rows) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(rows);
  });
});

app.get("/getcheques", (req, res)=>{
  console.log("request submitted")
  const sqlGet= "SELECT * FROM cheques_issued_for_clearance";
  db.query(sqlGet, (error, result)=>{
      if (error) return res.status(500).json(error);
      console.log(result)
      return res.send(result)
      
  })
})



app.get ('/getcheque/:id', (req, res) =>{
  const {id} = req.params;
  console.log("id to get post is ", id)
  const q = "SELECT * FROM cheques_issued_for_clearance WHERE chq_issue_id=?";
  db.query(q, [id], (err, data)=>{
      if (err) return res.status(500).json(err);
      console.log("post", data[0]);
      return res.status(200).json(data[0]);
  })
})

app.post("/addcheque", (req, res)=>{
  const { chq_no, chq_date, supplier_name, chq_amnt } = req.body;
  console.log(chq_no, chq_date, supplier_name, chq_amnt);
  const sqlAdd = "INSERT INTO cheques_issued_for_clearance (chq_no, chq_date, supplier_name, chq_amnt) VALUES (?, ?, ?, ?)";
  db.query(sqlAdd, [chq_no, chq_date, supplier_name, chq_amnt], (error, result)=>{
      res.send(result);
  })
})

app.post("/deletecheque/:id", (req, res)=>{
  const {id} = req.params;
  console.log(id);
  const sqlDelete = "DELETE FROM cheques_issued_for_clearance WHERE chq_issue_id=?";
  db.query(sqlDelete, [id], (error, result)=>{
      console.log(error);
  })
})

app.put("/editcheque/:id", (req, res)=>{
  const { id } = req.params;
  const  {chq_no, chq_date, supplier_name, chq_amnt } = req.body;
  console.log("Data to edit", chq_no, chq_date, supplier_name, chq_amnt)
  const sqlGet= "UPDATE cheques_issued_for_clearance SET chq_no=?, chq_date=?, supplier_name=?, chq_amnt=? WHERE chq_issue_id = ?";
  db.query(sqlGet, [chq_no, chq_date, supplier_name, chq_amnt, id], (error, result)=>{
      if (error) {
          console.log(error)
      }
      res.send(result)
  });
})

app.get("/getrepadjustments", (req, res)=>{
  console.log("request submitted")
  const sqlGet= "SELECT * FROM rep_adjustment";
  db.query(sqlGet, (error, result)=>{
      res.send(result)
  })
})

app.get("/getpurchaseissues", (req, res)=>{
  const sqlGet= "SELECT * FROM purchase_issues";
  db.query(sqlGet, (error, result)=>{
      res.send(result)
  })
})

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

app.get ('/getcheque/:id', (req, res) =>{
  const {id} = req.params;
  console.log("id to get post is ", id)
  const q = "SELECT * FROM cheques_issued_for_clearance WHERE chq_issue_id=?";
  db.query(q, [id], (err, data)=>{
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

app.get("/categories", (req, res)=>{
  const query = "SELECT * FROM grocery_category";

  db.query(query, (error, result)=>{
      console.log(result);
      res.send(result)
  })
})
app.get("/products", (req, res)=>{
  console.log("Req received to fetch products")
  const query = "SELECT * FROM grocery_products";

  db.query(query, (error, result)=>{
      console.log(result);
      res.send(result)
  })
})

app.post('/addproduct', (req, res)=>{
console.log(req.body)
const query = "INSERT INTO products (product_name, product_desc, product_packing, brand, sale_rate, category, image) VALUES(?,?,?,?,?,?,?)";
db.query(query, [req.body.productName, req.body.productDesc, req.body.productPacking, req.body.productBrand, req.body.productSaleRate, req.body.productCategory, req.body.img], (error, result)=>{
 if (error) {
  console.log(error)
 }
  res.send(result)
})
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
