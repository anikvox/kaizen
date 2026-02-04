export const env = {
  port: Number(process.env.API_PORT) || 60092,
  corsOrigins: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:60091"],
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  databaseUrl: process.env.DATABASE_URL,
} as const;
