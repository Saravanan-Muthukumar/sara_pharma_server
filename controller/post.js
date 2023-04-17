import { db } from "../db.js";
import jwt from "jsonwebtoken";

export const getPosts = (req, res) =>{
    // res.json("from controller")
    const q = req.query.cat? "SELECT * FROM blogs WHERE cat=?" 
    : "SELECT * FROM blogs";
    db.query(q, [req.query.cat], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("posts", data);
        return res.status(200).json(data);
    })

}
export const getPost = (req, res) =>{
    // res.json("from controller")
    const {id} = req.params;
    console.log("id to get post is ", id)
    const q = "SELECT p.id, `username`, `title`, `desc`, p.img, u.img AS userImg, `cat`, `date` FROM users u JOIN blogs p ON u.id = p.uid WHERE p.id = ? ";
    db.query(q, [id], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("post", data[0]);
        return res.status(200).json(data[0]);
    })
}

export const addPost = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, userInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const q = "INSERT INTO sims (`title`, `desc`, `img`, `date`, `uid`, `cat`) VALUES (?)";
    const values = [
        req.body.title,
        req.body.desc,
        req.body.img,
        req.body.date,
        5,
        req.body.cat
    ]
    console.log("values", values)
    db.query(q, [values], (err,data)=>{
        if (err) return res.status(500).json(err);
        return res.status(200).json("Post added")
    })
    
    })
}


export const deletePost = (req, res) =>{
    // res.json("from controller")
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, userInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const postId = req.params.id;
        const q = "DELETE FROM blogs WHERE id = ? AND uid = ?";
        db.query(q, [postId, userInfo.id], (err, data)=>{
            if(err) return res.status(403).json("You can delete only your post");

            return res.json("Post Deleted");
        })
    })


}
export const updatePost = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not authenticated!");
  
    jwt.verify(token, "jwtkey", (err, userInfo) => {
      if (err) return res.status(403).json("Token is not valid!");
  
      const postId = req.params.id;
      const q =
        "UPDATE blogs SET `title`=?,`desc`=?,`img`=?,`cat`=? WHERE `id` = ? AND `uid` = ?";
  
      const values = [req.body.title, req.body.desc, req.body.img, req.body.cat];
  
      db.query(q, [...values, postId, userInfo.id], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json("Post has been updated.");
      });
    });
}
