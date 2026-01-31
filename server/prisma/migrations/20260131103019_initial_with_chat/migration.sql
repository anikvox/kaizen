-- CreateTable
CREATE TABLE "WebsiteVisit" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "activeTime" INTEGER NOT NULL DEFAULT 0,
    "referrer" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WebsiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextAttention" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TextAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAttention" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "caption" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ImageAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeAttention" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "caption" TEXT,
    "activeWatchTime" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "YoutubeAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioAttention" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AudioAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Focus" (
    "id" SERIAL NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "insights" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "textCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "youtubeCount" INTEGER NOT NULL DEFAULT 0,
    "audioCount" INTEGER NOT NULL DEFAULT 0,
    "modelUsed" TEXT NOT NULL,
    "traceId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Focus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceName" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteVisit_url_key" ON "WebsiteVisit"("url");

-- CreateIndex
CREATE INDEX "WebsiteVisit_openedAt_idx" ON "WebsiteVisit"("openedAt");

-- CreateIndex
CREATE INDEX "WebsiteVisit_updatedAt_idx" ON "WebsiteVisit"("updatedAt");

-- CreateIndex
CREATE INDEX "WebsiteVisit_userId_idx" ON "WebsiteVisit"("userId");

-- CreateIndex
CREATE INDEX "TextAttention_timestamp_idx" ON "TextAttention"("timestamp");

-- CreateIndex
CREATE INDEX "TextAttention_url_idx" ON "TextAttention"("url");

-- CreateIndex
CREATE INDEX "TextAttention_userId_idx" ON "TextAttention"("userId");

-- CreateIndex
CREATE INDEX "ImageAttention_timestamp_idx" ON "ImageAttention"("timestamp");

-- CreateIndex
CREATE INDEX "ImageAttention_url_idx" ON "ImageAttention"("url");

-- CreateIndex
CREATE INDEX "ImageAttention_userId_idx" ON "ImageAttention"("userId");

-- CreateIndex
CREATE INDEX "YoutubeAttention_timestamp_idx" ON "YoutubeAttention"("timestamp");

-- CreateIndex
CREATE INDEX "YoutubeAttention_videoId_idx" ON "YoutubeAttention"("videoId");

-- CreateIndex
CREATE INDEX "YoutubeAttention_userId_idx" ON "YoutubeAttention"("userId");

-- CreateIndex
CREATE INDEX "AudioAttention_timestamp_idx" ON "AudioAttention"("timestamp");

-- CreateIndex
CREATE INDEX "AudioAttention_url_idx" ON "AudioAttention"("url");

-- CreateIndex
CREATE INDEX "AudioAttention_userId_idx" ON "AudioAttention"("userId");

-- CreateIndex
CREATE INDEX "Focus_timestamp_idx" ON "Focus"("timestamp");

-- CreateIndex
CREATE INDEX "Focus_windowStart_windowEnd_idx" ON "Focus"("windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "Focus_category_idx" ON "Focus"("category");

-- CreateIndex
CREATE INDEX "Focus_userId_idx" ON "Focus"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_installationId_key" ON "DeviceToken"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_token_idx" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE INDEX "ChatSession_createdAt_idx" ON "ChatSession"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_chatSessionId_idx" ON "ChatMessage"("chatSessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "WebsiteVisit" ADD CONSTRAINT "WebsiteVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextAttention" ADD CONSTRAINT "TextAttention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAttention" ADD CONSTRAINT "ImageAttention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeAttention" ADD CONSTRAINT "YoutubeAttention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioAttention" ADD CONSTRAINT "AudioAttention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Focus" ADD CONSTRAINT "Focus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
