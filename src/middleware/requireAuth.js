// src/middleware/requireAuth.js
const { verifyAccessToken } = require("../lib/auth");

function requireAuth(req, res, next) {
    // headers can vary in casing; Express normalizes them to lowercase internally
    const raw = req.get("authorization") || req.get("Authorization") || "";

    if (typeof raw !== "string" || !raw.toLowerCase().startsWith("bearer ")) {
        return res
            .status(401)
            .json({ error: "Missing Authorization Bearer token" });
    }

    const token = raw.slice(7).trim(); // remove "bearer "

    if (!token || typeof token !== "string") {
        return res.status(401).json({ error: "Missing token" });
    }

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded; // { sub, email, role, iat, exp }
        return next();
    } catch (err) {
        return res.status(401).json({
            error: "Invalid or expired token",
            message: err?.message || String(err),
        });
    }
}

module.exports = { requireAuth };
