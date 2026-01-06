const router = require("express").Router();
const { webhookController } = require("../controllers/webhook.controller");

// This is called by your inbound email provider (SendGrid/Mailgun/Postmark)
router.post("/inbound-email", webhookController.inboundEmail);

module.exports = router;
