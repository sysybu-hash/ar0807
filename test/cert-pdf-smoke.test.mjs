import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCertificatePdfBuffer } from "../certificate-pdf.mjs";

test("installation certificate PDF builds", async () => {
  const buf = await buildCertificatePdfBuffer({
    certificate: {
      id: 1,
      docType: "installation",
      facilityName: "מתקן",
      address: "בניין דוד 18",
      connectionSize: "3*80",
      groundingValue: "TT",
      insulation: "",
      notes: "לוח מחומר פלסטי",
      photos: [],
      extra: {
        clientName: "פיצה אורי ביתר",
        installationType: "חנות / מסחרי",
        inspectionDate: "2026-04-16",
        techInspection: [
          { description: "לולאת תקלה (LT)", result: "0.44" },
          { description: "בידוד (L-PE)", result: "2.2" },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    inspector: {
      name: "אברהם רובינשטיין - רובינשטיין חשמל",
      licenseNo: "949789",
      phone: "0587600807",
      email: "a0587600807@gmail.com",
      inspectorDeclarationText: "",
    },
  });
  assert.ok(buf.length > 2000);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});
