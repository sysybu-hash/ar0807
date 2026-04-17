import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFinancialPdfBuffer } from "../financial-pdf.mjs";

test("buildFinancialPdfBuffer returns a non-empty PDF buffer", async () => {
  const buf = await buildFinancialPdfBuffer({
    doc: {
      id: 1,
      type: "invoice",
      docNo: "INV-1",
      allocationNo: "",
      issueDate: "2026-04-15",
      dueDate: "",
      customerName: "בדיקה",
      customerId: "",
      customerAddress: "",
      notes: "הערה",
      subtotal: 100,
      taxRate: 18,
      taxAmount: 18,
      totalAmount: 118,
      status: "פתוח",
      items: [],
    },
    inspector: {
      name: "בודק בדיקה",
      licenseNo: "L-123",
      phone: "0500000000",
    },
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 800);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});
