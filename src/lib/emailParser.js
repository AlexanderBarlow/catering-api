// src/lib/emailParser.js
// v2 parser for Chick-fil-A inbound catering order emails (forwarded)
// - Extracts store code (e.g. 02348) from subject/body
// - Extracts fulfillment type (pickup/delivery)
// - Extracts pickup time from "Friday 1/9/2026 at 10:45am"
// - Extracts customer info (name/phone/email), guestCount, paperGoods
// - Extracts items + modifiers (indented sauce lines) and prices
// - Extracts subtotal/tax/total
// - Produces a normalized object for DB insert in webhook.controller.js

const { DateTime } = require("luxon");

function clean(str) {
    return String(str ?? "").trim();
}

function normalizeText(input = "") {
    return String(input ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function parseMoneyToCents(str) {
    // "$150.52" -> 15052
    if (!str) return 0;
    const m = String(str).match(/-?\$?\s*([\d,]+)(?:\.(\d{1,2}))?/);
    if (!m) return 0;
    const dollars = Number(m[1].replace(/,/g, ""));
    const cents = Number((m[2] || "0").padEnd(2, "0"));
    if (!Number.isFinite(dollars) || !Number.isFinite(cents)) return 0;
    return Math.round(dollars * 100 + (dollars < 0 ? -cents : cents));
}

function parseEmail(str) {
    if (!str) return null;
    const m = String(str).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0] : null;
}

function parsePhone(str) {
    if (!str) return null;
    // accepts +16105742061 or 6105742061 etc; normalize to +###########
    const s = String(str).replace(/[^\d+]/g, "");
    const m = s.match(/(\+?\d{10,15})/);
    if (!m) return null;
    const raw = m[1];
    // if it is 10 digits without +, assume US
    if (!raw.startsWith("+") && raw.length === 10) return `+1${raw}`;
    return raw.startsWith("+") ? raw : `+${raw}`;
}

function parseStoreCode(subject, text) {
    const hay = `${subject || ""}\n${text || ""}`;

    // Common patterns in your sample:
    // "... for (02348)"
    // "Catering Pickup Order for 02348"
    const m =
        hay.match(/\((\d{4,6})\)/) ||
        hay.match(/\bfor\s+(\d{4,6})\b/i) ||
        hay.match(/\border\s+for\s+(\d{4,6})\b/i);

    return m ? m[1] : null;
}

function parseFulfillmentType(subject, text) {
    const hay = `${subject || ""}\n${text || ""}`.toLowerCase();
    if (hay.includes("catering delivery")) return "DELIVERY";
    if (hay.includes("pickup order")) return "PICKUP";
    if (hay.includes("catering pickup")) return "PICKUP";
    return "UNKNOWN";
}

function getLines(text) {
    return normalizeText(text)
        .split("\n")
        .map((l) => l.replace(/\s+$/g, "")) // keep leading spaces for indent detection
        .filter((l) => l.trim().length > 0);
}

function findLineIndex(lines, exactLower) {
    return lines.findIndex((l) => l.trim().toLowerCase() === exactLower);
}

function parsePickupTime(text) {
    const lines = getLines(text);

    // Pickup Time
    // Friday 1/9/2026 at 10:45am
    const idx = findLineIndex(lines, "pickup time");
    if (idx === -1 || !lines[idx + 1]) return null;

    const raw = lines[idx + 1].trim();

    // "Friday 1/9/2026 at 10:45am"
    const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (!m) return null;

    let month = parseInt(m[1], 10);
    let day = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    let hour = parseInt(m[4], 10);
    let minute = m[5] ? parseInt(m[5], 10) : 0;
    const ampm = m[6].toLowerCase();

    if (![month, day, year, hour, minute].every(Number.isFinite)) return null;
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    // Interpret in America/New_York (matches your app + user timezone)
    const dt = DateTime.fromObject(
        { year, month, day, hour, minute, second: 0, millisecond: 0 },
        { zone: "America/New_York" }
    );

    if (!dt.isValid) return null;
    return dt.toJSDate();
}

function parseCustomerBlock(text) {
    const lines = getLines(text);

    const idx = findLineIndex(lines, "customer information");
    if (idx === -1) {
        return {
            customerName: null,
            customerPhone: null,
            customerEmail: null,
            guestCount: null,
            paperGoods: null,
        };
    }

    // Expected layout:
    // Customer Information
    // Mikey Zadroga
    // +16105742061
    // mikeyzadroga@gmail.com
    // Guest Count:  24
    // Paper Goods:  No
    const name = lines[idx + 1]?.trim() || null;
    const phone = parsePhone(lines[idx + 2]?.trim());
    const email = parseEmail(lines[idx + 3]?.trim());

    // guest count + paper goods can appear in next few lines (order may vary)
    let guestCount = null;
    let paperGoods = null;

    for (let i = idx + 4; i < Math.min(lines.length, idx + 12); i++) {
        const l = lines[i].trim();

        const gm = l.match(/guest\s*count\s*:\s*(\d+)/i);
        if (gm) guestCount = parseInt(gm[1], 10);

        const pm = l.match(/paper\s*goods\s*:\s*(yes|no)/i);
        if (pm) paperGoods = pm[1].toLowerCase() === "yes";
    }

    return {
        customerName: name || null,
        customerPhone: phone || null,
        customerEmail: email || null,
        guestCount: Number.isFinite(guestCount) ? guestCount : null,
        paperGoods: typeof paperGoods === "boolean" ? paperGoods : null,
    };
}

function parseTotals(text) {
    const lines = getLines(text);

    // Lines often like:
    // Subtotal
    // $142.00
    // Tax
    // $8.52
    // Total
    // $150.52
    function findMoneyAfterLabel(labelLower) {
        const i = findLineIndex(lines, labelLower);
        if (i === -1) return 0;

        // sometimes amount is on same line ("Subtotal $142.00") or next line
        const sameLine = lines[i].match(/\$[\d,]+(?:\.\d{1,2})?/);
        if (sameLine) return parseMoneyToCents(sameLine[0]);

        const next = lines[i + 1]?.trim();
        return next ? parseMoneyToCents(next) : 0;
    }

    const subtotalCents = findMoneyAfterLabel("subtotal");
    const taxCents = findMoneyAfterLabel("tax");
    const totalCents = findMoneyAfterLabel("total");

    return { subtotalCents, taxCents, totalCents };
}

function parseItemsWithModifiers(text) {
    const lines = getLines(text);

    const start = findLineIndex(lines, "item name");
    if (start === -1) return [];

    // Stop at subtotal
    const stop = findLineIndex(lines, "subtotal");
    const end = stop === -1 ? lines.length : stop;

    const region = lines.slice(start + 1, end);

    // In the region, pattern is typically:
    // <Item Name>
    // <Quantity>
    // <$Price>   (optional for modifiers)
    // Modifiers appear "indented" or have no price and are often sauces, etc.
    //
    // We'll parse by scanning blocks:
    // - Name line (string)
    // - Qty line (int)
    // - Optional price line ($...)
    //
    // If a block has price => main item
    // If no price => modifier; attach to last main item as child
    const items = [];
    let lastMainItemIndex = -1;

    function looksLikeSectionHeader(s) {
        const x = s.trim().toLowerCase();
        return (
            x === "quantity" ||
            x === "price" ||
            x === "item name" ||
            x === "subtotal" ||
            x === "tax" ||
            x === "total"
        );
    }

    let i = 0;
    while (i < region.length) {
        let nameLine = region[i];
        if (!nameLine || looksLikeSectionHeader(nameLine)) {
            i++;
            continue;
        }

        const rawName = nameLine; // keep indentation info
        const name = rawName.trim();
        const qtyLine = region[i + 1]?.trim();
        const priceLine = region[i + 2]?.trim();

        const qty = qtyLine && /^\d+$/.test(qtyLine) ? parseInt(qtyLine, 10) : null;
        const hasPrice = Boolean(priceLine && /\$[\d,]+(?:\.\d{1,2})?/.test(priceLine));
        const priceCents = hasPrice ? parseMoneyToCents(priceLine) : 0;

        // If we don't have a quantity, this isn't a parseable item block.
        // Advance by 1 to avoid getting stuck.
        if (!Number.isFinite(qty) || qty <= 0) {
            i++;
            continue;
        }

        const isIndented = /^\s{2,}/.test(rawName); // modifier lines typically have leading spaces
        const isModifier = !hasPrice || isIndented;

        const entry = {
            name,
            quantity: qty,
            priceCents,
            notes: null,
            parentItemId: null, // filled later in DB create if you want; here we just structure
            _modifierOf: null,  // internal marker
        };

        if (isModifier && lastMainItemIndex >= 0) {
            entry._modifierOf = lastMainItemIndex;
            items.push(entry);
        } else {
            // main item
            lastMainItemIndex = items.length;
            items.push(entry);
        }

        // Move pointer:
        // If price present => consumed 3 lines, else consumed 2
        i += hasPrice ? 3 : 2;
    }

    // Convert internal marker into nested structure for easier DB insert
    const mainItems = [];
    const mainIndexMap = new Map(); // oldIndex -> mainItems index
    const modifiersByMain = new Map(); // mainItemsIndex -> []

    // First pass: identify main items (no _modifierOf)
    items.forEach((it, idx) => {
        if (it._modifierOf === null) {
            const mi = {
                name: it.name,
                quantity: it.quantity,
                priceCents: it.priceCents,
                notes: it.notes,
                modifiers: [],
            };
            mainIndexMap.set(idx, mainItems.length);
            mainItems.push(mi);
        }
    });

    // Second pass: attach modifiers
    items.forEach((it, idx) => {
        if (it._modifierOf !== null) {
            const mainOldIndex = it._modifierOf;
            const mainNewIndex = mainIndexMap.get(mainOldIndex);
            if (mainNewIndex === undefined) return;

            mainItems[mainNewIndex].modifiers.push({
                name: it.name,
                quantity: it.quantity,
                priceCents: it.priceCents,
                notes: it.notes,
            });
        }
    });

    return mainItems;
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

function parseNotesLine(text) {
    const t = String(text || "");
    const m = t.match(/notes\s*:\s*(.+)$/im);
    return m ? clean(m[1]) : null;
}

function parseInboundEmail({ from, subject, text }) {
    const rawText = normalizeText(text || "");
    const storeCode = parseStoreCode(subject, rawText);
    const fulfillmentType = parseFulfillmentType(subject, rawText);
    const pickupTime = parsePickupTime(rawText);
    const customer = parseCustomerBlock(rawText);
    const totals = parseTotals(rawText);
    const items = parseItemsWithModifiers(rawText);
    const customerNotes = parseNotesLine(rawText);

    // Confidence rule v2:
    // - Must have pickupTime + at least 1 main item to be "RECEIVED"
    // - Else "PENDING_REVIEW"
    const confident = Boolean(pickupTime) && items.length > 0;

    // Flatten items into create-friendly list WITH modifiers nested (for later DB create)
    // We'll return nested structure so your controller can create parent items then modifiers.
    return {
        source: "cfa.email",
        storeCode: storeCode || null,
        fulfillmentType,

        customerName: customer.customerName,
        customerEmail: customer.customerEmail,
        customerPhone: customer.customerPhone,
        guestCount: customer.guestCount,
        paperGoods: customer.paperGoods,

        pickupTime: pickupTime || null,
        notes: buildNotes({ from, subject, customerNotes, text: rawText }),

        // NEW schema money fields
        subtotalCents: totals.subtotalCents || 0,
        taxCents: totals.taxCents || 0,
        totalCents: totals.totalCents || 0,

        // Nested items: [{name,quantity,priceCents, modifiers:[...]}]
        items,

        status: confident ? "RECEIVED" : "PENDING_REVIEW",
        receivedAt: new Date(),
    };
}

module.exports = { parseInboundEmail };
