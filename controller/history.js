import {db} from '../db.js';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const getHistorys = (req, res) =>{
    // res.json("from controller")
    const q ="SELECT * FROM historys" 
    db.query(q, (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("posts", data);
        return res.status(200).json(data);
    })

}
export const getHistory = (req, res) =>{
    // res.json("from controller")
    const {id} = req.params;
    console.log("id to get post is ", id)
    const q = "SELECT * FROM historys WHERE id=?";
    db.query(q, [id], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("post", data[0]);
        return res.status(200).json(data[0]);
    })
}

export const addHistory = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, historyInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
            // CHECK EXISTING HISTORY
    console.log(req.body)
    const q = "SELECT * FROM HISTORYS WHERE mh_name = ?";
    db.query(q, [req.body.mh_name], (err, data)=>{
        if(err) return res.status(500).json(err);
        console.log(data)
        if(data.length) return res.status(409).json("History already exists!");


        const q = "INSERT INTO historys (`mh_name`, `mh_desc`, `status`, `pid`) VALUES (?);"
        const values = [req.body.mh_name, req.body.mh_desc, req.body.status, req.body.pid];
        console.log("Details to create history", values)
        db.query(q, [values], (err, data)=>{
            if(err) return res.status(500).json(err);
            return res.status(200).json("History created!");
        });
    });
    })
}


export const deleteHistory = (req, res) =>{
    // res.json("from controller")
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, historyInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const postId = req.params.id;
        const q = "DELETE FROM historys WHERE mh_id = ?";
        console.log("delete history", postId)
        db.query(q, [postId], (err, data)=>{
            if(err) return res.status(403).json("You can delete only your post");

            return res.json("Post Deleted");
        })
    })


}
export const updateHistory = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not authenticated!");
  
    jwt.verify(token, "jwtkey", (err, historyInfo) => {
      if (err) return res.status(403).json("Token is not valid!");
  
      const postId = req.params.id;

      const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        console.log(hash)

      const q =
        "UPDATE historys SET `historyname`=?,`email`=?,`password`=? WHERE `id` = ?";
  
      const values = [req.body.historyname, req.body.email, hash];
  
      db.query(q, [...values, postId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json("Post has been updated.");
      });
    });
}
