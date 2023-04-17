import express from 'express'
import {addSim, deleteSim, getSim, getSims, updateSim} from '../controller/sim.js';

const router = express.Router()

router.get("/", getSims)
router.get("/:sim_id", getSim)
router.post("/", addSim)
router.delete("/:sim_id", deleteSim)
router.put("/:sim_id", updateSim)

export default router;