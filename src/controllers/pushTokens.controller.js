const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const pushTokenSchema = z.object({
    token: z.string().min(20).max(512),
    provider: z.string().min(1).max(32).default("expo"),
    platform: z.string().min(1).max(32).optional(),
    channelId: z.string().min(1).max(64).optional(),
    deviceName: z.string().max(256).nullable().optional(),
    deviceType: z.number().int().nullable().optional(),
    appOwnership: z.string().max(64).nullable().optional(),
});

const pushTokensController = {
    upsert: async (req, res) => {
        const parsed = pushTokenSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: "Invalid push token payload",
                details: parsed.error.flatten(),
            });
        }

        const data = parsed.data;
        const token = await prisma.pushToken.upsert({
            where: { token: data.token },
            update: {
                userId: req.user.sub,
                provider: data.provider,
                platform: data.platform || null,
                channelId: data.channelId || null,
                deviceName: data.deviceName || null,
                deviceType: data.deviceType ?? null,
                appOwnership: data.appOwnership || null,
                disabledAt: null,
                lastRegisteredAt: new Date(),
            },
            create: {
                userId: req.user.sub,
                token: data.token,
                provider: data.provider,
                platform: data.platform || null,
                channelId: data.channelId || null,
                deviceName: data.deviceName || null,
                deviceType: data.deviceType ?? null,
                appOwnership: data.appOwnership || null,
            },
        });

        res.status(201).json({ data: { id: token.id, token: token.token } });
    },

    disable: async (req, res) => {
        const token = decodeURIComponent(req.params.token);

        await prisma.pushToken.updateMany({
            where: {
                token,
                userId: req.user.sub,
                disabledAt: null,
            },
            data: { disabledAt: new Date() },
        });

        res.status(204).send();
    },
};

module.exports = { pushTokensController };
