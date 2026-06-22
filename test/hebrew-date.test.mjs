import test from "node:test";
import assert from "node:assert/strict";
import { formatHebrewDateFull, parseIsoDate } from "../lib/hebrew-date.mjs";

test("parseIsoDate accepts YYYY-MM-DD", () => {
  const d = parseIsoDate("2026-06-22");
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
});

test("formatHebrewDateFull returns full Jewish date with weekday", () => {
  const s = formatHebrewDateFull("2026-06-22");
  assert.match(s, /יום שני/);
  assert.match(s, /תמוז/);
  assert.match(s, /תשפ/);
});

test("formatHebrewDateFull uses fallback iso", () => {
  const s = formatHebrewDateFull("", "2026-06-22T10:00:00Z");
  assert.ok(s.length > 8);
});

test("browser Hebrew date year is not repeated tav letters", async () => {
  const { formatHebrewDateFull: browserFormat } = await import("../public/js/hebrew-date.js");
  const s = browserFormat("2026-06-22");
  assert.match(s, /תשפ/);
  assert.doesNotMatch(s, /ת{3,}/);
});
