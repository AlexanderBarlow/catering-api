// controllers/webhook.controller.js
const crypto = require("crypto");
const { prisma } = require("../lib/prisma");
const { parseInboundEmail } = require("../lib/emailParser");

// IMPORTANT: replace with provider signature verification
function verifyWebhook(_req) {
    return true;
}

function normalizeForHash(input = "") {
    return String(input ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function sha256(str) {
    return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

async function createOrderWithItemsTx(parsed, subject) {
    return prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
            data: {
                source: parsed.source || "cfa.email",
                storeCode: parsed.storeCode || null,
                fulfillmentType: parsed.fulfillmentType || "UNKNOWN",

                customerName: parsed.customerName || null,
                customerEmail: parsed.customerEmail || null,
                customerPhone: parsed.customerPhone || null,
                guestCount: typeof parsed.guestCount === "number" ? parsed.guestCount : null,
                paperGoods: typeof parsed.paperGoods === "boolean" ? parsed.paperGoods : null,

                pickupTime: parsed.pickupTime ? new Date(parsed.pickupTime) : null,
                notes: parsed.notes || null,

                status: parsed.status || "PENDING_REVIEW",

                subtotalCents: parsed.subtotalCents || 0,
                taxCents: parsed.taxCents || 0,
                totalCents: parsed.totalCents || 0,

                receivedAt: parsed.receivedAt || new Date(),

                events: {
                    create: [
                        {
                            type: "order.created_from_email",
                            message: `Created from email: ${subject || "(no subject)"}`,
                            actorId: null,
                        },
                    ],
                },
            },
        });

        const mainItems = Array.isArray(parsed.items) ? parsed.items : [];

        for (const item of mainItems) {
            const createdMain = await tx.orderItem.create({
                data: {
                    orderId: order.id,
                    name: item.name,
                    quantity: item.quantity ?? 1,
                    priceCents: item.priceCents ?? 0,
                    notes: item.notes ?? null,
                    parentItemId: null,
                },
            });

            const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
            for (const mod of modifiers) {
                await tx.orderItem.create({
                    data: {
                        orderId: order.id,
                        name: mod.name,
                        quantity: mod.quantity ?? 1,
                        priceCents: mod.priceCents ?? 0,
                        notes: mod.notes ?? null,
                        parentItemId: createdMain.id,
                    },
                });
            }
        }

        return order;
    });
}

const webhookController = {
    inboundEmail: async (req, res) => {
        if (!verifyWebhook(req)) {
            return res.status(401).json({ error: "Invalid webhook signature" });
        }

        const messageId =
            req.body.messageId ||
            req.body["Message-Id"] ||
            req.body["message-id"] ||
            req.body.id;

        const from = req.body.from || req.body.sender || "";
        const subject = req.body.subject || "";
        const text = req.body.text || req.body["stripped-text"] || req.body.plain || "";
        const html = req.body.html || req.body["stripped-html"] || req.body.htmlBody || null;

        if (!messageId) {
            return res.status(400).json({ error: "Missing messageId" });
        }

        const normalizedText = normalizeForHash(text || "");
        const bodyHash = normalizedText ? sha256(normalizedText) : null;

        // ✅ Deduplicate by messageId
        const existingByMessageId = await prisma.emailIngest.findUnique({
            where: { messageId },
        });
        if (existingByMessageId) {
            return res.json({ ok: true, deduped: true, orderId: existingByMessageId.orderId });
        }

        // ✅ Deduplicate forwarded emails by bodyHash
        if (bodyHash) {
            const existingByHash = await prisma.emailIngest.findFirst({
                where: { bodyHash },
                orderBy: { createdAt: "desc" },
            });

            if (existingByHash) {
                await prisma.emailIngest.create({
                    data: {
                        source: "inbound_email",
                        messageId,
                        from,
                        subject,
                        receivedAt: new Date(),
                        rawText: text ? String(text).slice(0, 200000) : null,
                        rawHtml: html ? String(html).slice(0, 200000) : null,
                        bodyHash,
                        parseStatus: "SUCCESS",
                        orderId: existingByHash.orderId,
                        error: "Deduped by bodyHash (forwarded duplicate).",
                    },
                });

                return res.json({
                    ok: true,
                    deduped: true,
                    orderId: existingByHash.orderId,
                });
            }
        }

        // Create ingest record
        const ingest = await prisma.emailIngest.create({
            data: {
                source: "inbound_email",
                messageId,
                from,
                subject,
                receivedAt: new Date(),
                rawText: text ? String(text).slice(0, 200000) : null,
                rawHtml: html ? String(html).slice(0, 200000) : null,
                bodyHash,
                parseStatus: "NEEDS_REVIEW",
            },
        });

        try {
            const parsed = parseInboundEmail({ from, subject, text });

            const needsReview =
                !parsed?.pickupTime ||
                !Array.isArray(parsed.items) ||
                parsed.items.length === 0;

            const order = await createOrderWithItemsTx(parsed, subject);

            await prisma.emailIngest.update({
                where: { id: ingest.id },
                data: {
                    parseStatus: needsReview ? "NEEDS_REVIEW" : "SUCCESS",
                    orderId: order.id,
                    error: needsReview ? "Missing pickupTime or items; needs review." : null,
                },
            });

            const io = req.app.get("io");
            if (io) {
                io.to("role:ADMIN").emit("order:created", { orderId: order.id });
                io.to("role:STAFF").emit("order:created", { orderId: order.id });
                io.to(`order:${order.id}`).emit("order:updated", { orderId: order.id });
                io.to("role:ADMIN").emit("analytics:invalidate", { scope: "overview" });
            }

            return res.json({
                ok: true,
                orderId: order.id,
                parseStatus: needsReview ? "NEEDS_REVIEW" : "SUCCESS",
            });
        } catch (err) {
            await prisma.emailIngest.update({
                where: { id: ingest.id },
                data: {
                    parseStatus: "FAILED",
                    error: String(err?.message || err),
                },
            });

            return res.status(500).json({ error: "Failed to process inbound email" });
        }
    },
};

module.exports = { webhookController };
