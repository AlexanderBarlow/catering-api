const https = require("https");
const { prisma } = require("./prisma");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_BATCH_SIZE = 100;

function isExpoPushToken(token) {
    return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

function postJson(url, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const req = https.request(
            url,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(body),
                },
            },
            (res) => {
                let data = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    let json = null;
                    try {
                        json = data ? JSON.parse(data) : null;
                    } catch {
                        json = data || null;
                    }

                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        const err = new Error(`Expo push request failed (${res.statusCode})`);
                        err.payload = json;
                        reject(err);
                        return;
                    }

                    resolve(json);
                });
            }
        );

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function formatPickupTime(order) {
    if (!order?.pickupTime) return null;

    try {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
        }).format(new Date(order.pickupTime));
    } catch {
        return null;
    }
}

function buildNewOrderMessage(order) {
    const customer = order.customerName || "New catering order";
    const pickup = formatPickupTime(order);
    const fulfillment = order.fulfillmentType && order.fulfillmentType !== "UNKNOWN"
        ? String(order.fulfillmentType).toLowerCase()
        : null;

    const details = [fulfillment, pickup].filter(Boolean).join(" • ");

    return {
        title: "New catering order",
        body: details ? `${customer} • ${details}` : customer,
    };
}

async function disableDeviceNotRegisteredTokens(tokensByIndex, ticketData) {
    const disabledTokens = [];

    for (let index = 0; index < ticketData.length; index += 1) {
        const ticket = ticketData[index];
        if (
            ticket?.status === "error" &&
            ticket?.details?.error === "DeviceNotRegistered" &&
            tokensByIndex[index]
        ) {
            disabledTokens.push(tokensByIndex[index]);
        }
    }

    if (disabledTokens.length === 0) return;

    await prisma.pushToken.updateMany({
        where: { token: { in: disabledTokens } },
        data: { disabledAt: new Date() },
    });
}

async function sendNewOrderPush(order) {
    if (process.env.PUSH_NOTIFICATIONS_ENABLED === "false") return;

    const registrations = await prisma.pushToken.findMany({
        where: {
            provider: "expo",
            disabledAt: null,
            user: { active: true },
        },
        select: { token: true },
    });

    const tokens = [...new Set(registrations.map((r) => r.token).filter(isExpoPushToken))];
    if (tokens.length === 0) return;

    const { title, body } = buildNewOrderMessage(order);

    for (const tokenBatch of chunk(tokens, PUSH_BATCH_SIZE)) {
        const messages = tokenBatch.map((to) => ({
            to,
            sound: "default",
            title,
            body,
            data: {
                orderId: order.id,
                url: `/order/${order.id}`,
                type: "order.created",
            },
            channelId: "new-orders",
        }));

        try {
            const response = await postJson(EXPO_PUSH_URL, messages);
            if (Array.isArray(response?.data)) {
                await disableDeviceNotRegisteredTokens(tokenBatch, response.data);
            }
        } catch (error) {
            console.error("Failed to send new order push notification", error?.payload || error);
        }
    }
}

module.exports = { sendNewOrderPush };
