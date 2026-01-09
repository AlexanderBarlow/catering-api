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

const VALID_ROLES = new Set(["ADMIN", "MANAGER", "STAFF"]);

async function listUsers(req, res, next) {
    try {
        const users = await prisma.user.findMany({
            orderBy: [{ role: "asc" }, { createdAt: "desc" }],
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                active: true,
            },
        });

        res.json({ data: users.map(pickUser) });
    } catch (err) {
        next(err);
    }
}

async function createUser(req, res, next) {
    try {
        const { name, email, role } = req.body || {};

        const cleanName = (name || "").trim();
        const cleanEmail = (email || "").trim().toLowerCase();
        const cleanRole = (role || "STAFF").toUpperCase();

        if (!cleanName) return res.status(400).json({ error: "Name is required" });
        if (!isEmail(cleanEmail)) return res.status(400).json({ error: "Valid email is required" });
        if (!VALID_ROLES.has(cleanRole)) return res.status(400).json({ error: "Invalid role" });

        const exists = await prisma.user.findUnique({
            where: { email: cleanEmail },
            select: { id: true },
        });
        if (exists) return res.status(409).json({ error: "User with that email already exists" });

        // ✅ generate temp password
        const tempPassword = `CFA-${Math.random().toString(36).slice(2, 8)}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;

        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const user = await prisma.user.create({
            data: {
                name: cleanName,
                email: cleanEmail,
                role: cleanRole,
                active: true,
                passwordHash,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                active: true,
            },
        });

        // Return tempPassword once (admin can copy/share)
        res.status(201).json({ data: pickUser(user), tempPassword });
    } catch (err) {
        next(err);
    }
}


async function updateUser(req, res, next) {
    try {
        const { id } = req.params;
        const { active, name, role } = req.body || {};

        const existing = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true },
        });

        if (!existing) {
            return res.status(404).json({ error: "User not found" });
        }

        // Guard: ADMIN protected (matches your UI expectations)
        if (existing.role === "ADMIN") {
            if (typeof active === "boolean") {
                return res.status(403).json({ error: "Admins cannot be disabled" });
            }
        }

        const data = {};

        if (typeof active === "boolean") data.active = active;
        if (typeof name === "string" && name.trim()) data.name = name.trim();
        if (typeof role === "string") {
            const cleanRole = role.toUpperCase();
            if (!VALID_ROLES.has(cleanRole)) {
                return res.status(400).json({ error: "Invalid role" });
            }
            data.role = cleanRole;
        }

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "No valid fields provided" });
        }

        const updated = await prisma.user.update({
            where: { id },
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

        res.json({ data: pickUser(updated) });
    } catch (err) {
        next(err);
    }
}

async function deleteUser(req, res, next) {
    try {
        const { id } = req.params;

        const existing = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true },
        });

        if (!existing) {
            return res.status(404).json({ error: "User not found" });
        }

        if (existing.role === "ADMIN") {
            return res.status(403).json({ error: "Admins cannot be deleted" });
        }

        await prisma.user.delete({ where: { id } });

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listUsers,
    createUser,
    updateUser,
    deleteUser,
};
