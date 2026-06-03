-- Add Expo push token registrations for mobile clients.
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'expo',
    "platform" TEXT,
    "channelId" TEXT,
    "deviceName" TEXT,
    "deviceType" INTEGER,
    "appOwnership" TEXT,
    "disabledAt" TIMESTAMP(3),
    "lastRegisteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");
CREATE INDEX "PushToken_disabledAt_idx" ON "PushToken"("disabledAt");
CREATE INDEX "PushToken_lastRegisteredAt_idx" ON "PushToken"("lastRegisteredAt");

ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
