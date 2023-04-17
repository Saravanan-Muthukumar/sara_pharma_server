import express from 'express'
import {addAdmission, deleteAdmission, getAdmission, getAdmissions, updateAdmission} from '../controller/admission.js';

const router = express.Router()

router.get("/", getAdmissions)
router.get("/:id", getAdmission)
router.post("/:id", addAdmission)
router.delete("/:id", deleteAdmission)
router.put("/:id", updateAdmission)

export default router;