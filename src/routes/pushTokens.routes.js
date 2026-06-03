const router = require("express").Router();
const { requireAuth } = require("../middleware/requireAuth");
const { pushTokensController } = require("../controllers/pushTokens.controller");

router.use(requireAuth);

router.post("/", pushTokensController.upsert);
router.delete("/:token", pushTokensController.disable);

module.exports = router;
