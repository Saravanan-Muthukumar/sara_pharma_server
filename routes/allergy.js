import express from 'express'
import {addAllergy, deleteAllergy, getAllergy, getAllergyOfPatient, getAllergys, updateAllergy} from '../controller/allergy.js';

const router = express.Router()

router.get("/", getAllergys)
router.get("/:id", getAllergy)
router.get("/bypid/:pid", getAllergyOfPatient)
router.post("/", addAllergy)
router.delete("/:id", deleteAllergy)
router.put("/:id", updateAllergy)

export default router;