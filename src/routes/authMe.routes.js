// src/routes/authMe.routes.js
const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/requireAuth");

// ✅ IMPORTANT: match your actual filename exactly
// Your file is: src/controllers/authMe.controllers.js
const { me, updateMe, changePassword } = require("../controllers/authMe.controller");

// GET /auth/me
router.get("/me", requireAuth, me);

// PUT /auth/me  (update name/email)
router.put("/me", requireAuth, updateMe);

// PUT /auth/password  (change password)
router.put("/password", requireAuth, changePassword);

module.exports = router;
