const http = require("http");
const { app } = require("./app");
const { Server } = require("socket.io");
const { verifyAccessToken } = require("./lib/auth");

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
});

io.use((socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error("Missing token"));

        const user = verifyAccessToken(token);
        socket.user = user; // { sub, email, role, ... }
        next();
    } catch (err) {
        next(new Error("Invalid token"));
    }
});

io.on("connection", (socket) => {
    console.log("socket connected:", socket.id, socket.user.email, socket.user.role);

    // Join role room (useful for admin-wide broadcasts)
    socket.join(`role:${socket.user.role}`);

    // Allow client to subscribe to a specific order
    socket.on("join:order", (orderId) => {
        if (typeof orderId === "string" && orderId.length > 10) {
            socket.join(`order:${orderId}`);
            socket.emit("joined:order", { orderId });
        }
    });

    socket.on("disconnect", () => {
        console.log("socket disconnected:", socket.id);
    });
});

// make io available to controllers
app.set("io", io);

server.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});
