import express from 'express'
import {addPatient, deletePatient, getPatient, getPatients, updatePatient} from '../controller/patient.js';

const router = express.Router()

router.get("/", getPatients)
router.get("/:id", getPatient)
router.post("/", addPatient)
router.delete("/:id", deletePatient)
router.put("/:id", updatePatient)

export default router;