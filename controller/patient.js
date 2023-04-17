import {db} from '../db.js';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const getPatients = (req, res) =>{
    // res.json("from controller")
    const q ="SELECT * FROM patients" 
    db.query(q, (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("posts", data);
        return res.status(200).json(data);
    })

}
export const getPatient = (req, res) =>{
    // res.json("from controller")
    const {id} = req.params;
    console.log("id to get post is ", id)
    const q = "SELECT * FROM patients WHERE pid=?";
    db.query(q, [id], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("post", data[0]);
        return res.status(200).json(data[0]);
    })
}

export const addPatient = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, patientInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
            // CHECK EXISTING PATIENT
    console.log(req.body)
    const q = "SELECT * FROM PATIENTS WHERE p_name = ?";
    db.query(q, [req.body.p_name], (err, data)=>{
        if(err) return res.status(500).json(err);
        console.log(data)
        if(data.length) return res.status(409).json("Patient already exists!");


        const q = "INSERT INTO patients (`p_name`, `p_gender`, `p_dob`, `p_address1`, `p_address2`, `p_address3`, `p_phone`, `p_email`, `p_hospital_number`, `p_NoK_name`, `p_NoK_relationship`) VALUES (?);"
        const values = [
            req.body.p_name, 
            req.body.p_gender, 
            req.body.p_dob,
            req.body.p_address1, 
            req.body.p_address2, 
            req.body.p_address3, 
            req.body.p_phone, 
            req.body.p_email, 
            req.body.p_hospital_number, 
            req.body.p_NoK_name,
            req.body.p_NoK_relationship
        ];
        console.log("Details to create patient", values)
        db.query(q, [values], (err, data)=>{
            if(err) return res.status(500).json(err);
            return res.status(200).json("Patient created!");
        });
    });
    })
}


export const deletePatient = (req, res) =>{
    // res.json("from controller")
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, patientInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const postId = req.params.id;
        const q = "DELETE FROM patients WHERE id = ?";
        console.log("delete patient", postId)
        db.query(q, [postId, patientInfo.id], (err, data)=>{
            if(err) return res.status(403).json("You can delete only your post");

            return res.json("Post Deleted");
        })
    })


}
export const updatePatient = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not authenticated!");
  
    jwt.verify(token, "jwtkey", (err, patientInfo) => {
      if (err) return res.status(403).json("Token is not valid!");
  
      const postId = req.params.id;

      const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        console.log(hash)

      const q =
        "UPDATE patients SET `patientname`=?,`email`=?,`password`=? WHERE `id` = ?";
  
      const values = [req.body.patientname, req.body.email, hash];
  
      db.query(q, [...values, postId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json("Post has been updated.");
      });
    });
}
