const { prisma } = require("../lib/prisma");
const { parseInboundEmail } = require("../lib/emailParser");

// IMPORTANT: we'll replace this with provider signature verification
function verifyWebhook(_req) {
    // For local dev only. We'll add real verification when you pick provider.
    return true;
}

const webhookController = {
    inboundEmail: async (req, res) => {
        if (!verifyWebhook(req)) return res.status(401).json({ error: "Invalid webhook signature" });

        // Normalize common inbound payload fields (provider-specific, but these cover many)
        const messageId =
            req.body.messageId ||
            req.body["Message-Id"] ||
            req.body["message-id"] ||
            req.body.id;

        const from = req.body.from || req.body.sender || "";
        const subject = req.body.subject || "";
        const text = req.body.text || req.body["stripped-text"] || req.body.plain || "";
        const html = req.body.html || req.body["stripped-html"] || req.body.htmlBody || null;

        if (!messageId) return res.status(400).json({ error: "Missing messageId" });

        // Idempotency: don't ingest same email twice
        const existing = await prisma.emailIngest.findUnique({ where: { messageId } });
        if (existing) return res.json({ ok: true, deduped: true, orderId: existing.orderId });

        // Create ingest record first
        const ingest = await prisma.emailIngest.create({
            data: {
                source: "inbound_email",
                messageId,
                from,
                subject,
                receivedAt: new Date(),
                rawText: text ? String(text).slice(0, 200000) : null,
                rawHtml: html ? String(html).slice(0, 200000) : null,
                parseStatus: "NEEDS_REVIEW",
            },
        });

        try {
            const parsed = parseInboundEmail({ from, subject, text });

            const order = await prisma.order.create({
                data: {
                    customerName: parsed.customerName,
                    customerEmail: parsed.customerEmail,
                    customerPhone: parsed.customerPhone,
                    pickupTime: parsed.pickupTime ? new Date(parsed.pickupTime) : null,
                    notes: parsed.notes,
                    status: parsed.status,
                    totalCents: parsed.totalCents || 0,
                    receivedAt: parsed.receivedAt || new Date(),
                    items: parsed.items?.length ? { create: parsed.items } : undefined,
                    events: {
                        create: [
                            {
                                type: "order.created_from_email",
                                message: `Created from email: ${subject}`,
                                actorId: null,
                            },
                        ],
                    },
                },
            });

            await prisma.emailIngest.update({
                where: { id: ingest.id },
                data: { parseStatus: "SUCCESS", orderId: order.id },
            });

            // Realtime notify
            const io = req.app.get("io");
            io.to("role:ADMIN").emit("order:created", { orderId: order.id });
            io.to("role:STAFF").emit("order:created", { orderId: order.id });
            io.to(`order:${order.id}`).emit("order:updated", { orderId: order.id });

            // Hint admin analytics to refresh
            io.to("role:ADMIN").emit("analytics:invalidate", { scope: "overview" });

            return res.json({ ok: true, orderId: order.id });
        } catch (err) {
            await prisma.emailIngest.update({
                where: { id: ingest.id },
                data: { parseStatus: "FAILED", error: String(err?.message || err) },
            });

            return res.status(500).json({ error: "Failed to process inbound email" });
        }
    },
};

module.exports = { webhookController };
