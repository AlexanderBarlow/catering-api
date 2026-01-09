const router = require("express").Router();
const {
    listUsers,
    createUser,
    updateUser,
    deleteUser,
} = require("../controllers/users.controller");

// NOTE: Add auth middleware later if you want these protected:
// const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
