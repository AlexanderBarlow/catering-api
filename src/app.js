// src/app.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const ordersRoutes = require("./routes/orders.routes");
const usersRoutes = require("./routes/users.routes");
const healthRoutes = require("./routes/health.routes");
const webhookRoutes = require("./routes/webhook.routes");

const app = express();

// /src/app.js -> /public
const PUBLIC_DIR = path.join(__dirname, "..", "public");

/**
 * -------------------------
 * Middleware
 * -------------------------
 */
app.use(helmet());
app.use(cors({ origin: "*", credentials: false }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

/**
 * -------------------------
 * Static site (Landing + Docs)
 * -------------------------
 */

// Serve ALL static files first
app.use(express.static(PUBLIC_DIR));

// Explicit landing page
app.get("/", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Explicit docs page (covers /docs and /docs/)
app.get("/docs", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "docs", "index.html"));
});
app.get("/docs/", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "docs", "index.html"));
});

/**
 * -------------------------
 * API Routes
 * -------------------------
 */
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/orders", ordersRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/users", usersRoutes);

/**
 * -------------------------
 * 404 + Error handlers
 * -------------------------
 */
app.use((req, res) => {
    res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
});

module.exports = { app };
