import {db} from '../db.js';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const getUsers = (req, res) =>{
    // res.json("from controller")
    const q ="SELECT * FROM users" 
    db.query(q, (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("posts", data);
        return res.status(200).json(data);
    })

}
export const getUser = (req, res) =>{
    // res.json("from controller")
    const {id} = req.params;
    console.log("id to get post is ", id)
    const q = "SELECT * FROM users WHERE id=?";
    db.query(q, [id], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("post", data[0]);
        return res.status(200).json(data[0]);
    })
}

export const addUser = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, userInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
            // CHECK EXISTING USER
    console.log(req.body)
    const q = "SELECT * FROM USERS WHERE email = ? OR username = ?";
    db.query(q, [req.body.email, req.body.username], (err, data)=>{
        if(err) return res.status(500).json(err);
        console.log(data)
        if(data.length) return res.status(409).json("User already exists!");

        // HASH 
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        console.log(hash)

        const q = "INSERT INTO users (`username`, `email`, `password`) VALUES (?);"
        const values = [req.body.username, req.body.email, hash];
        console.log("Details to create user", values)
        db.query(q, [values], (err, data)=>{
            if(err) return res.status(500).json(err);
            return res.status(200).json("User created!");
        });
    });
    })
}


export const deleteUser = (req, res) =>{
    // res.json("from controller")
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, userInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const postId = req.params.id;
        const q = "DELETE FROM users WHERE id = ?";
        console.log("delete user", postId)
        db.query(q, [postId, userInfo.id], (err, data)=>{
            if(err) return res.status(403).json("You can delete only your post");

            return res.json("Post Deleted");
        })
    })


}
export const updateUser = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not authenticated!");
  
    jwt.verify(token, "jwtkey", (err, userInfo) => {
      if (err) return res.status(403).json("Token is not valid!");
  
      const postId = req.params.id;

      const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        console.log(hash)

      const q =
        "UPDATE users SET `username`=?,`email`=?,`password`=? WHERE `id` = ?";
  
      const values = [req.body.username, req.body.email, hash];
  
      db.query(q, [...values, postId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json("Post has been updated.");
      });
    });
}
