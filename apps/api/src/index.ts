import { serve } from "@hono/node-server";
import { env } from "./lib/index.js";
import app from "./app.js";

console.log(`Server running on http://localhost:${env.port}`);

serve({
  fetch: app.fetch,
  port: env.port,
});
