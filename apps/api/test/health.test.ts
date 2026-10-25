import request from "supertest";
import { describe, expect, it } from "vitest";

import { testApp } from "./helpers.js";

describe("GET /health", () => {
  it("returns ok and the network", async () => {
    const res = await request(testApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", network: "testnet" });
  });
});
