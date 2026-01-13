// test-email-parser.js
const fs = require("fs");
const { parseInboundEmail } = require("./src/lib/emailParser");

// paste raw email text here or load from file
const rawEmail = `
Catering Delivery Order for 02348
Delivery Time
Wednesday 1/14/2026 at 11:30am
Delivery Address
2675 Morgantown Road
Penske (white Penske building)
Reading, PA 19607
Customer Information
Pepper Joulwan
+15706403397
pepper.joulwan@penske.com
Guest Count:  15
Paper Goods:  No
Item Name
Large Garden Salad Tray
1
$47.00
Subtotal
$47.00
Tax
$2.82
Total
$49.82
`;

const result = parseInboundEmail({
    from: "Chick-fil-A <one@email.chick-fil-a.com>",
    subject: "Incoming Catering Order: Delivery Order Received for (02348)",
    text: rawEmail,
});

console.dir(result, { depth: null });
