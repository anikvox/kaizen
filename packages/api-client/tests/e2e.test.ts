import { describe, it, expect, beforeAll } from "vitest";
import { createApiClient, ApiClient } from "../src/index.js";

const API_URL = process.env.API_URL || "http://localhost:60092";

describe("E2E API Tests", () => {
  let client: ApiClient;

  beforeAll(() => {
    client = createApiClient(API_URL);
  });

  describe("Health Endpoint", () => {
    it("should return health status", async () => {
      const health = await client.health.check();

      expect(health).toBeDefined();
      expect(health.status).toBe("ok");
      expect(health.db).toBe("connected");
    });

    it("should return welcome message", async () => {
      const message = await client.health.getMessage();

      expect(message).toBeDefined();
      expect(message.message).toBeDefined();
      expect(typeof message.message).toBe("string");
    });
  });
});
