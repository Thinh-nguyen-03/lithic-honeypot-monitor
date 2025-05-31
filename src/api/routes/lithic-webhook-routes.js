import express from "express";
import { handleLithicEvent } from "../controllers/lithic-webhook-controller.js";

const router = express.Router();

router.post("/lithic", handleLithicEvent);

export default router;
