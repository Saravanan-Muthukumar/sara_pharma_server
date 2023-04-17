const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 9000;

app.get("/", (req,res)=> {
    res.send("Hello there! Api is working well")
})

app.listen(PORT, () => console.log(`Sever is running port ${PORT} ...`));
