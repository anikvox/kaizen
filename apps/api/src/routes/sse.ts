import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";

const app = new Hono<{ Variables: AuthVariables }>();

app.use("/*", authMiddleware);

app.get("/", async (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0;
    while (true) {
      await stream.writeSSE({
        data: JSON.stringify({ time: new Date().toISOString() }),
        event: "tick",
        id: String(id++),
      });
      await stream.sleep(1000);
    }
  });
});

export default app;
