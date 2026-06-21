import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.NODE_ENV = "test";
// Avoid throwing on missing JWT in non-production
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-ci-only";

const { default: app } = await import("../server.mjs");

test("GET /api/health returns 503 without DATABASE_URL (DB not initialized)", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 503);
});

test("GET /api/share/:token returns 503 when DB unavailable", async () => {
  const res = await request(app).get("/api/share/nope");
  assert.equal(res.status, 503);
});
