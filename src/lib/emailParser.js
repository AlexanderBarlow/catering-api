// src/lib/emailParser.js
// v1 parser for inbound catering order emails
// - Extracts customer name from subject ("Catering Order - John Doe")
// - Extracts pickup time from text ("Pickup: tomorrow 2:30pm" / "Pickup: today 11am")
// - Extracts items from lines like "- Nugget Tray x2"
// - Extracts notes from "Notes: ..."
// - Produces a normalized object for DB insert in webhook.controller.js

const { DateTime } = require("luxon");

function clean(str) {
    return String(str ?? "").trim();
}

function parseCustomerNameFromSubject(subject) {
    // Example: "Catering Order - John Doe" -> "John Doe"
    const s = clean(subject);
    const m = s.match(/catering\s*order\s*[-:]\s*(.+)$/i);
    return m ? clean(m[1]) : null;
}

function parsePickupTime(text) {
    const t = String(text || "");

    // Supports: "Pickup: tomorrow 2:30pm" / "Pickup: today 11am"
    const m = t.match(/pickup\s*:\s*(tomorrow|today)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (!m) return null;

    const dayWord = m[1].toLowerCase();
    let hour = parseInt(m[2], 10);
    const minute = m[3] ? parseInt(m[3], 10) : 0;
    const ampm = m[4].toLowerCase();

    if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    // Interpret in America/New_York so "tomorrow 2:30pm" means local time
    let dt = DateTime.now().setZone("America/New_York");
    if (dayWord === "tomorrow") dt = dt.plus({ days: 1 });

    dt = dt.set({ hour, minute, second: 0, millisecond: 0 });

    // Return JS Date (represents an absolute instant; DB will store it correctly)
    return dt.toJSDate();
}

function parseItems(text) {
    // Looks for lines like: "- Nugget Tray x2" or "Nugget Tray x2"
    // Only parses quantities; priceCents remains 0 until you add pricing rules.
    const lines = String(text || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    const items = [];

    for (const line of lines) {
        // Skip common section headers
        if (/^(items|order|details)\s*:?\s*$/i.test(line)) continue;

        const m = line.match(/^-?\s*(.+?)\s+x\s*(\d+)\s*$/i);
        if (!m) continue;

        const name = clean(m[1]);
        const quantity = parseInt(m[2], 10);

        if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;

        items.push({
            name,
            quantity,
            priceCents: 0,
            notes: null,
        });
    }

    return items;
}

function parseNotesLine(text) {
    const t = String(text || "");
    const m = t.match(/notes\s*:\s*(.+)$/im);
    return m ? clean(m[1]) : null;
}

function buildNotes({ from, subject, customerNotes, text }) {
    const parts = [
        `FROM: ${clean(from) || "unknown"}`,
        `SUBJECT: ${clean(subject) || "(no subject)"}`,
        "",
        customerNotes ? `CUSTOMER NOTES: ${customerNotes}` : null,
        "",
        "RAW EMAIL:",
        String(text || ""),
    ].filter((x) => x !== null);

    return parts.join("\n").slice(0, 5000);
}

function parseInboundEmail({ from, subject, text }) {
    const customerName = parseCustomerNameFromSubject(subject);
    const pickupTime = parsePickupTime(text);
    const items = parseItems(text);
    const customerNotes = parseNotesLine(text);

    // "Confidence" rule for v1:
    // if we found either pickup time or items, we mark RECEIVED; else PENDING_REVIEW.
    const confident = Boolean(pickupTime) || items.length > 0;

    return {
        customerName: customerName || null,
        customerEmail: null,
        customerPhone: null,
        pickupTime: pickupTime || null,
        notes: buildNotes({ from, subject, customerNotes, text }),
        items,
        totalCents: 0,
        status: confident ? "RECEIVED" : "PENDING_REVIEW",
        receivedAt: new Date(),
    };
}

module.exports = { parseInboundEmail };
