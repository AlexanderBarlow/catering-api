const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const statusToTimestampField = {
    RECEIVED: "receivedAt",
    ACCEPTED: "acceptedAt",
    IN_PROGRESS: "inProgressAt",
    READY: "readyAt",
    COMPLETED: "completedAt",
    CANCELED: "canceledAt",
};

const ordersController = {
    list: async (req, res) => {
        const status = req.query.status;

        const orders = await prisma.order.findMany({
            where: status ? { status } : {},
            orderBy: { createdAt: "desc" },
            take: 100,
            include: { items: true },
        });

        res.json({ data: orders });
    },

    getById: async (req, res) => {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: {
                items: true,
                events: { orderBy: { createdAt: "asc" } },
            },
        });

        if (!order) return res.status(404).json({ error: "Order not found" });
        res.json({ data: order });
    },

    create: async (req, res) => {
        // For now: restrict to ADMIN
        if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });

        const schema = z.object({
            customerName: z.string().min(1).optional(),
            customerEmail: z.string().email().optional(),
            customerPhone: z.string().min(7).optional(),
            pickupTime: z.string().datetime().optional(), // ISO
            notes: z.string().max(5000).optional(),
            items: z
                .array(
                    z.object({
                        name: z.string().min(1),
                        quantity: z.number().int().min(1).default(1),
                        priceCents: z.number().int().min(0).default(0),
                        notes: z.string().max(1000).optional(),
                    })
                )
                .default([]),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

        const data = parsed.data;

        // total from items
        const totalCents = data.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

        const order = await prisma.order.create({
            data: {
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                customerPhone: data.customerPhone,
                pickupTime: data.pickupTime ? new Date(data.pickupTime) : null,
                notes: data.notes,
                status: "RECEIVED",
                receivedAt: new Date(),
                totalCents,
                items: data.items.length ? { create: data.items } : undefined,
                events: {
                    create: [
                        {
                            type: "order.created",
                            message: `Order created by ${req.user.email}`,
                            actorId: req.user.sub,
                        },
                    ],
                },
            },
            include: { items: true },
        });

        // emit realtime
        const io = req.app.get("io");
        io.to("role:ADMIN").emit("order:created", { orderId: order.id });
        io.to("role:STAFF").emit("order:created", { orderId: order.id });

        res.status(201).json({ data: order });
    },

    updateStatus: async (req, res) => {
        const schema = z.object({
            status: z.enum(["PENDING_REVIEW", "RECEIVED", "ACCEPTED", "IN_PROGRESS", "READY", "COMPLETED", "CANCELED"]),
            message: z.string().max(2000).optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

        const { status, message } = parsed.data;

        const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: "Order not found" });

        const tsField = statusToTimestampField[status];
        const tsUpdate = tsField && !existing[tsField] ? { [tsField]: new Date() } : {};

        const updated = await prisma.order.update({
            where: { id: existing.id },
            data: {
                status,
                ...tsUpdate,
            },
        });

        await prisma.orderEvent.create({
            data: {
                orderId: updated.id,
                type: "status.updated",
                message: message || `Status set to ${status}`,
                actorId: req.user.sub,
            },
        });

        const io = req.app.get("io");

        // notify anyone looking at this order
        io.to(`order:${updated.id}`).emit("order:updated", { orderId: updated.id });

        // notify admin/staff dashboards
        io.to("role:ADMIN").emit("order:updated", { orderId: updated.id });
        io.to("role:STAFF").emit("order:updated", { orderId: updated.id });

        // optional: analytics refresh hint
        io.to("role:ADMIN").emit("analytics:invalidate", { scope: "overview" });

        res.json({ data: updated });
    },
};

module.exports = { ordersController };
