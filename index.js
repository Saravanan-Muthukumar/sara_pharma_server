const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require ('body-parser');
const cors = require ('cors');
const mysql = require('mysql2');

const db = mysql.createPool({
    host: "localhost",
    user: 'root',
    password: 'password',
    database: 'crud_contact'
})

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));

const PORT = process.env.PORT || 9000;

app.get("/", (req,res)=> {
    res.send("Hello there! Api is working well")
})

app.get("/test", (req,res)=> {
    res.send("Hello there! Test Api is working well")
})

app.listen(PORT, () => console.log(`Sever is running port ${PORT} ...`));
