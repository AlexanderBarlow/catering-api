const router = require("express").Router();
const { requireAuth } = require("../middleware/requireAuth");
const { ordersController } = require("../controllers/orders.controller");

router.use(requireAuth);

router.get("/", ordersController.list);
router.get("/:id", ordersController.getById);
router.patch("/:id/status", ordersController.updateStatus);

module.exports = router;
