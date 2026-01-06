const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const ACCESS_TTL_MIN = Number(process.env.ACCESS_TOKEN_TTL_MIN || 15);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

if (!ACCESS_SECRET || !REFRESH_SECRET) {
    throw new Error("Missing JWT secrets in .env (JWT_ACCESS_SECRET/JWT_REFRESH_SECRET)");
}

function signAccessToken(payload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: `${ACCESS_TTL_MIN}m` });
}

function signRefreshToken(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_DAYS}d` });
}

function verifyAccessToken(token) {
    return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
    return jwt.verify(token, REFRESH_SECRET);
}

async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// store refresh tokens hashed in DB (safe if DB leaks)
async function hashToken(token) {
    return bcrypt.hash(token, 12);
}

async function verifyTokenHash(token, tokenHash) {
    return bcrypt.compare(token, tokenHash);
}

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    hashPassword,
    verifyPassword,
    hashToken,
    verifyTokenHash,
};
