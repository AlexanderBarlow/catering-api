require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const authRoutes = require("./routes/auth.routes");
const ordersRoutes = require("./routes/orders.routes");
const usersRoutes = require("./routes/users.routes");




const healthRoutes = require("./routes/health.routes");
const webhookRoutes = require("./routes/webhook.routes");



const app = express();

// middleware
app.use(helmet());
app.use(cors({ origin: "*", credentials: false }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// routes
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/orders", ordersRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/users", usersRoutes);




// basic error handler (simple for now)
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
});

module.exports = { app };
