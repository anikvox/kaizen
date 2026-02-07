export const env = {
  port: Number(process.env.API_PORT) || 60092,
  corsOrigins: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:60091"],
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  databaseUrl: process.env.DATABASE_URL,
  // Encryption
  encryptionKey: process.env.ENCRYPTION_KEY,
  // Gemini (system default)
  geminiApiKey: process.env.GEMINI_API_KEY,
  // Opik
  opikApiKey: process.env.OPIK_API_KEY,
  opikWorkspace: process.env.OPIK_WORKSPACE_NAME,
  opikProjectName: process.env.OPIK_PROJECT_NAME || "kaizen",
} as const;
