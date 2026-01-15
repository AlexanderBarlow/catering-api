const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    verifyPassword,
    hashToken,
    verifyTokenHash,
} = require("../lib/auth");

const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

const authController = {
    // POST /auth/login
    login: async (req, res) => {
        const schema = z.object({
            email: z.string().email(),
            password: z.string().min(6),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: "Invalid credentials" });

        const accessToken = signAccessToken({
            sub: user.id,
            email: user.email,
            role: user.role,
        });

        const refreshToken = signRefreshToken({ sub: user.id });

        const tokenHash = await hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

        await prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });

        res.json({
            accessToken,
            refreshToken,
            user: { id: user.id, email: user.email, role: user.role, name: user.name },
        });
    },

    // POST /auth/refresh
    refresh: async (req, res) => {
        const schema = z.object({ refreshToken: z.string().min(10) });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

        const { refreshToken } = parsed.data;

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch {
            return res.status(401).json({ error: "Invalid refresh token" });
        }

        const userId = decoded.sub;

        // Find a matching (hashed) refresh token in DB (last 20 active tokens)
        const candidates = await prisma.refreshToken.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" },
            take: 20,
        });

        let match = null;
        for (const rt of candidates) {
            const ok = await verifyTokenHash(refreshToken, rt.tokenHash);
            if (ok) {
                match = rt;
                break;
            }
        }

        if (!match) return res.status(401).json({ error: "Refresh token not recognized" });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(401).json({ error: "User not found" });

        const newAccessToken = signAccessToken({
            sub: user.id,
            email: user.email,
            role: user.role,
        });

        res.json({ accessToken: newAccessToken });
    },

    // GET /auth/me
    me: async (req, res) => {
        try {
            // assuming your verifyAccessToken middleware sets req.user
            // (common pattern: req.user = { sub, email, role })
            const userId = req.user?.sub;

            if (!userId) return res.status(401).json({ error: "Unauthorized" });

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, role: true, name: true },
            });

            if (!user) return res.status(404).json({ error: "User not found" });

            return res.json({ user });
        } catch (e) {
            return res.status(500).json({ error: "Failed to load user" });
        }
    },

};

module.exports = { authController };
