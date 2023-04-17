import {db} from '../db.js';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const getAdmissions = (req, res) =>{
    // res.json("from controller")
    const q ="SELECT * FROM admissions" 
    db.query(q, (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("posts", data);
        return res.status(200).json(data);
    })

}
export const getAdmission = (req, res) =>{
    // res.json("from controller")
    const {id} = req.params;
    console.log("id to get post is ", id)
    const q = "SELECT * FROM admissions WHERE id=?";
    db.query(q, [id], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("post", data[0]);
        return res.status(200).json(data[0]);
    })
}

export const addAdmission = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, admissionInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
            // CHECK EXISTING ADMISSION
    console.log(req.body)
    const q = "SELECT * FROM ADMISSIONS WHERE email = ? OR admissionname = ?";
    db.query(q, [req.body.email, req.body.admissionname], (err, data)=>{
        if(err) return res.status(500).json(err);
        console.log(data)
        if(data.length) return res.status(409).json("Admission already exists!");

        // HASH 
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        console.log(hash)

        const q = "INSERT INTO admissions (`admissionname`, `email`, `password`) VALUES (?);"
        const values = [req.body.admissionname, req.body.email, hash];
        console.log("Details to create admission", values)
        db.query(q, [values], (err, data)=>{
            if(err) return res.status(500).json(err);
            return res.status(200).json("Admission created!");
        });
    });
    })
}


export const deleteAdmission = (req, res) =>{
    // res.json("from controller")
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, admissionInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const postId = req.params.id;
        const q = "DELETE FROM admissions WHERE id = ?";
        console.log("delete admission", postId)
        db.query(q, [postId, admissionInfo.id], (err, data)=>{
            if(err) return res.status(403).json("You can delete only your post");

            return res.json("Post Deleted");
        })
    })


}
export const updateAdmission = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not authenticated!");
  
    jwt.verify(token, "jwtkey", (err, admissionInfo) => {
      if (err) return res.status(403).json("Token is not valid!");
  
      const postId = req.params.id;

      const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        console.log(hash)

      const q =
        "UPDATE admissions SET `admissionname`=?,`email`=?,`password`=? WHERE `id` = ?";
  
      const values = [req.body.admissionname, req.body.email, hash];
  
      db.query(q, [...values, postId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json("Post has been updated.");
      });
    });
}
