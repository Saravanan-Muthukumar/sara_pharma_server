import { db } from "../db.js";
import jwt from "jsonwebtoken";

export const getSims = (req, res) =>{
    // res.json("from controller")
    const q = "SELECT * FROM simulations ";
    db.query(q, (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("sims", data);
        return res.status(200).json(data);
    })

}
export const getSim = (req, res) =>{
    // res.json("from controller")
    const {sim_id} = req.params;
    console.log("sim_id is ", sim_id)
    const q = "SELECT p.sim_id, `username`, `sim_name`, `sim_desc`, u.img AS userImg, `sim_date`, `sim_notes`, `sim_bed1`, `sim_bed2`, `sim_bed3`, `sim_bed4`, `sim_bed5`, `sim_bed6`, `camera_ops`, `co_ordinator`, `charge_nurse`, `psych_liaison`, `morning_doctor`, `afternoon_doctor`  FROM users u JOIN simulations p ON u.id = p.uid WHERE p.sim_id = ? ORDER BY sim_date DESC";
    db.query(q, [sim_id], (err, data)=>{
        if (err) return res.status(500).json(err);
        console.log("post", data[0]);
        return res.status(200).json(data[0]);
    })
}

export const addSim = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, userInfo)=>{
        if(err) return res.stauts(403).json("Token is not valid");
        const q = "INSERT INTO simulations (`sim_name`, `sim_desc`, `sim_date`, `sim_notes`, `sim_bed1`, `sim_bed2`, `sim_bed3`, `sim_bed4`, `sim_bed5`, `sim_bed6`, `camera_ops`, `co_ordinator`, `charge_nurse`, `psych_liaison`, `morning_doctor`, `afternoon_doctor`, `uid`) VALUES (?)";
    const values = [
        req.body.sim_name, 
        req.body.sim_desc, 
        req.body.sim_date,
        req.body.sim_notes, 
        req.body.sim_bed1, 
        req.body.sim_bed2, 
        req.body.sim_bed3, 
        req.body.sim_bed4, 
        req.body.sim_bed5, 
        req.body.sim_bed6,
        req.body.camera_ops,
        req.body.co_ordinator,
        req.body.charge_nurse,
        req.body.psych_liaison,
        req.body.morning_doctor,
        req.body.afternoon_doctor,
        req.body.uid
    ]
    console.log("Sim values", values)
    db.query(q, [values], (err,data)=>{
        if (err) return res.status(500).json(err);
        return res.status(200).json("Simulation added")
    })
    
    })
}

export const deleteSim = (req, res) =>{
    // res.json("from controller")
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not Aunthenticated");

    jwt.verify(token, "jwtkey", (err, userInfo)=>{
        if(err) return res.stauts(403).json("Tokens is not valid");
        const postId = req.params.sim_id;
        console.log('sim_id is ',postId);
        console.log(userInfo.id)
        const q = "DELETE FROM simulations WHERE sim_id = ? AND uid = ?";
        db.query(q, [postId, userInfo.id], (err, data)=>{
            if(err) return res.status(403).json("You can delete only your post");

            return res.json("Post Deleted");
        })
    })


}
export const updateSim = (req, res) =>{
    const token = req.cookies.access_token;
    if (!token) return res.status(401).json("Not authenticated!");
  
    jwt.verify(token, "jwtkey", (err, userInfo) => {
      if (err) return res.status(403).json("Token is not valid!");
  
      const postId = req.params.sim_id;

      const q =
        "UPDATE simulations SET `sim_name`=?, `sim_date`=?, `sim_desc`=?, `sim_notes`=?, `sim_bed1`=?, `sim_bed2`=?, `sim_bed3`=?, `sim_bed4`=?, `sim_bed5`=?, `sim_bed6`=?, `camera_ops`=?, `co_ordinator`=?, `charge_nurse`=?, `psych_liaison`=?, `morning_doctor`=?, `afternoon_doctor`=? WHERE `sim_id` = ? AND `uid` = ?";
  
      const values = [
        req.body.sim_name,
        req.body.sim_date,
        req.body.sim_desc, 
        req.body.sim_notes, 
        req.body.sim_bed1, 
        req.body.sim_bed2, 
        req.body.sim_bed3, 
        req.body.sim_bed4, 
        req.body.sim_bed5, 
        req.body.sim_bed6,
        req.body.camera_ops,
        req.body.co_ordinator,
        req.body.charge_nurse,
        req.body.psych_liaison,
        req.body.morning_doctor,
        req.body.afternoon_doctor,
    ];

        console.log("vales for editing ", values)
        console.log("sim_id", postId);
        console.log("uid is",userInfo.id )
  
      db.query(q, [...values, postId, userInfo.id], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json("Post has been updated.");
      });
    });
}
