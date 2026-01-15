const { prisma } = require("../lib/prisma");
const bcrypt = require("bcrypt");

function pickUser(u) {
    if (!u) return null;
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        active: u.active,
    };
}

function isEmail(email) {
    return typeof email === "string" && /\S+@\S+\.\S+/.test(email);
}

// Assumes your auth middleware sets req.user = { sub/email/role } from JWT
// or sets req.userId. Adjust the "userId" line to match your middleware.
async function me(req, res, next) {
    try {
        const userId = req.user?.sub || req.userId;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                active: true,
            },
        });

        if (!user) return res.status(401).json({ error: "User not found" });
        if (!user.active) return res.status(403).json({ error: "Account disabled" });

        res.json({ user: pickUser(user) });
    } catch (err) {
        next(err);
    }
}

async function updateMe(req, res, next) {
    try {
        const userId = req.user?.sub || req.userId;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { name, email } = req.body || {};
        const data = {};

        if (typeof name === "string" && name.trim()) {
            data.name = name.trim();
        }

        if (typeof email === "string") {
            const cleanEmail = email.trim().toLowerCase();
            if (!isEmail(cleanEmail)) return res.status(400).json({ error: "Valid email is required" });

            // ensure email not taken by someone else
            const exists = await prisma.user.findUnique({
                where: { email: cleanEmail },
                select: { id: true },
            });
            if (exists && exists.id !== userId) {
                return res.status(409).json({ error: "User with that email already exists" });
            }

            data.email = cleanEmail;
        }

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "No valid fields provided" });
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                active: true,
            },
        });

        res.json({ user: pickUser(updated) });
    } catch (err) {
        next(err);
    }
}

async function changePassword(req, res, next) {
    try {
        const userId = req.user?.sub || req.userId;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== "string" || currentPassword.length < 1) {
            return res.status(400).json({ error: "Current password is required" });
        }
        if (typeof newPassword !== "string" || newPassword.length < 6) {
            return res.status(400).json({ error: "New password must be at least 6 characters" });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true, active: true },
        });

        if (!user) return res.status(401).json({ error: "User not found" });
        if (!user.active) return res.status(403).json({ error: "Account disabled" });

        const ok = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!ok) return res.status(401).json({ error: "Invalid current password" });

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { me, updateMe, changePassword };
