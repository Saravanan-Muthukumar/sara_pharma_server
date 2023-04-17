import {db} from '../db.js';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const getAllergys = (req, res) =>{
    // res.json("from controller")
    const q ="SELECT * FROM allergys" 
    db.query(q, (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("Allergys", data);
        return res.status(200).json(data);
    })

}
export const getAllergy = (req, res) =>{
    // res.json("from controller")
    const {id} = req.params;
    console.log("id to getttt post is ", id)
    const q = "SELECT * FROM allergys WHERE id=?";
    db.query(q, [id], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("post", data[0]);
        return res.status(200).json(data[0]);
    })
}

export const getAllergyOfPatient = (req, res) =>{
    // res.json("from controller")
    const {pid} = req.params;
    console.log("pid to get postt is ", pid)
    const q = "SELECT * FROM allergys where pid=?";
    db.query(q, [pid], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("Allergy", data);
        return res.status(200).json(data);
    })
}

export const addAllergy = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, allergyInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
            // CHECK EXISTING ALLERGY
    console.log(req.body)
    const q = "SELECT * FROM allergys WHERE all_name = ?";
    db.query(q, [req.body.all_name], (err, data)=>{
        if(err) return res.status(500).json(err);
        console.log(data)
        if(data.length) return res.status(409).json("Allergy already exists!");

        const q = "INSERT INTO allergys (`all_name`, `all_desc`, `pid`) VALUES (?);"
        const values = [req.body.all_name, req.body.all_desc, req.body.pid];
        console.log("Details to create allergy", values)
        db.query(q, [values], (err, data)=>{
            if(err) return res.status(500).json(err);
            return res.status(200).json("Allergy created!");
        });
    });
    })
}


export const deleteAllergy = (req, res) =>{
    // res.json("from controller")
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, allergyInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const postId = req.params.id;
        const q = "DELETE FROM allergys WHERE all_id = ?";
        console.log("delete allergy", postId)
        db.query(q, [postId], (err, data)=>{
            if(err) return res.status(403).json("You can delete only your post");

            return res.json("Post Deleted");
        })
    })


}
export const updateAllergy = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not authenticated!");
  
    jwt.verify(token, "jwtkey", (err, allergyInfo) => {
      if (err) return res.status(403).json("Token is not valid!");
  
      const postId = req.params.id;

      const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        console.log(hash)

      const q =
        "UPDATE allergys SET `allergyname`=?,`email`=?,`password`=? WHERE `id` = ?";
  
      const values = [req.body.allergyname, req.body.email, hash];
  
      db.query(q, [...values, postId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json("Post has been updated.");
      });
    });
}
