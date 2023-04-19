const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require ('body-parser');
const cors = require ('cors');
const mysql = require('mysql2');

// const config = {
//     db: { /* do not put password or any sensitive info here, done only for demo */
//       host: process.env.HOST,
//       user: process.env.USER,
//       password: process.env.PASSWORD,
//       database: process.env.DATABASE,
//       waitForConnections: true,
//       connectionLimit: 2,
//       queueLimit: 0,
//     },
//   };

//   const db= mysql.createPool(config.db);
 
const host = process.env.HOST;
const user = process.env.USER;
const password = process.env.PASSWORD;
const database = process.env.DATABASE;
// const db = mysql.createConnection({
//     host: 'localhost',
//     // user: process.env.USER,
//     // password: process.env.PASSWORD,
//     // database: process.env.DATABASE
//     // host: "localhost",
//     user: 'root',
//     password: 'password',
//     database: 'crud_contact'
// })
const db = mysql.createConnection({
    host: process.env.HOST || 'localhost',
    // url: 'mysql://root:AEuQxhx7f9qzIMTTxjMQ@containers-us-west-179.railway.app:6179/railway',
    // user: process.env.USER,
    // password: process.env.PASSWORD,
    // database: process.env.DATABASE
    // host: "localhost",
    user: process.env.USER || 'root',
    password: process.env.PASSWORD || 'password',
    database: process.env.DATABASE || 'crud_contact',
    port:process.env.DB_PORT || '3306'
})

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));

const PORT = process.env.PORT ;
console.log(process.env.HOST)
console.log(process.env.USER)
console.log(process.env.PASSWORD)
console.log(process.env.DATABASE)

app.get("/", (req,res)=> {
    res.send("Hello there! Api is working well")
})

app.get("/test", (req,res)=> {
    console.log("request submitted to test")
    // res.send("Hello there! Test Api is working well")
    console.log("request submitted to test")
})

app.get("/api/get", (req, res)=>{
    console.log("request submitted")
    const sqlGet= "SELECT * FROM users";
    db.query(sqlGet, (error, result)=>{
        console.log(result);
        res.send(result)
    })
})

app.listen(PORT, () => console.log(`Sever is runninggg port ${PORT} ...`));
