const { verifyAccessToken } = require("../lib/auth");

function requireAuth(req, res, next) {
    const header = req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const token = header.slice("Bearer ".length);

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded; // { sub, email, role, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

module.exports = { requireAuth };
