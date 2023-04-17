import express from 'express';
import authRoutes from "./routes/auth.js"
import userRoutes from "./routes/users.js"
import postRoutes from "./routes/posts.js"
import simRoutes from "./routes/sims.js"
import patientRoutes from "./routes/patients.js"
import admissionRoutes from "./routes/admission.js"
import allergyRoutes from "./routes/allergy.js"
import historyRoutes from "./routes/history.js"
import cookieParser from "cookie-parser";
import multer from 'multer';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv'


dotenv.config();

const app = express ();
app.use(cookieParser());
app.use (express.json())
app.use(bodyParser.urlencoded({extended: true}));
const PORT = process.env.PORT || 8000;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, '../client/public/upload');
    },
    filename: function (req, file, cb) {
      cb(null, Date.now()+file.originalname);
    }
  })
  
  const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), function (req, res){
    const file = req.file;
    res.status(200).json(file.filename);
})

app.use ("/api/auth", authRoutes)
app.use ("/api/users", userRoutes)
app.use ("/api/posts", postRoutes)
app.use ("/api/sims", simRoutes)
app.use ("/api/patients", patientRoutes)
app.use ("/api/admissions", admissionRoutes)
app.use ("/api/allergys", allergyRoutes)
app.use ("/api/historys", historyRoutes)

app.get("/test2", (res, req)=>{
    res.send("from controller");
})




app.listen(PORT, ()=>{
    console.log("Conneccted")
});