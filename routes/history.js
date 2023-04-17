import express from 'express'
import {addHistory, deleteHistory, getHistory, getHistorys, updateHistory} from '../controller/history.js';

const router = express.Router()

router.get("/", getHistorys)
router.get("/:id", getHistory)
router.post("/", addHistory)
router.delete("/:id", deleteHistory)
router.put("/:id", updateHistory)

export default router;