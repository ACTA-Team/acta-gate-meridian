import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

describe("GET /health", () => {
  it("returns ok and the chain mode", async () => {
    const res = await request(createApp(loadConfig({}))).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", mode: "mock" });
  });
});
