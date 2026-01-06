require("dotenv").config();
const { prisma } = require("../lib/prisma");
const { hashPassword } = require("../lib/auth");

async function main() {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!email || !password) {
        throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env temporarily.");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log("Admin already exists:", email);
        return;
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
        data: { email, passwordHash, role: "ADMIN", name: "Admin" },
    });

    console.log("Created admin:", user.email, user.id);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
