const router = require("express").Router();
const { authController } = require("../controllers/auth.controller");
const { verifyAccessToken } = require("../lib/auth"); 

router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.get("/auth/me", verifyAccessToken, authController.me);

module.exports = router;
