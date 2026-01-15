// src/routes/auth.routes.js
const router = require("express").Router();

const { authController } = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/requireAuth");

// you pasted this file as authMe.controllers.js (plural)
const {
    me,
    updateMe,
    changePassword,
} = require("../controllers/authMe.controller");

router.post("/login", authController.login);
router.post("/refresh", authController.refresh);

// ✅ Correct: middleware that reads Authorization header + verifies JWT
router.get("/me", requireAuth, me);

// Optional: let users update their own profile
router.put("/me", requireAuth, updateMe);

// Optional: let users change their password
router.put("/password", requireAuth, changePassword);

module.exports = router;
