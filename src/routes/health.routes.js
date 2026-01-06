const router = require("express").Router();
const { prisma } = require("../lib/prisma");

router.get("/", (_req, res) => {
    res.json({
        ok: true,
        service: "catering-api",
        timestamp: new Date().toISOString(),
    });
});

router.get("/db", async (_req, res) => {
    try {
        // Fast, safe DB ping
        await prisma.$queryRaw`SELECT 1`;
        res.json({ ok: true, db: "connected" });
    } catch (err) {
        console.error("DB health check failed:", err);
        res.status(500).json({ ok: false, db: "disconnected" });
    }
});

module.exports = router;
