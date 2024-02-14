const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require ('body-parser');
const cors = require ('cors');
const mysql = require('mysql2');
const cookieParser = require ("cookie-parser");
const bcrypt = require ("bcryptjs");
const jwt = require ("jsonwebtoken");
 
const host = process.env.HOST;
const user = process.env.USER;
const password = process.env.PASSWORD;
const database = process.env.DATABASE;

const db = mysql.createConnection({
    host: process.env.HOST || 'localhost',
    user: process.env.USER || 'root',
    password: process.env.PASSWORD || 'password',
    database: process.env.DATABASE || 'blog',
    port:process.env.DB_PORT || '3306'
})

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

app.get("/getcheques", (req, res)=>{
  console.log("request submitted")
  const sqlGet= "SELECT * FROM cheques_issued_for_clearance";
  db.query(sqlGet, (error, result)=>{
      res.send(result)
      console.log(result)
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

app.listen(PORT, () => console.log(`Sever is runninggg port ${PORT} ...`));
