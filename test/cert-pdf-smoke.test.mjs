import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCertificatePdfBuffer } from "../certificate-pdf.mjs";
import { defaultExtraForType } from "../lib/cert-types.mjs";

const inspector = {
  name: "אברהם רובינשטיין - רובינשטיין חשמל",
  licenseNo: "949789",
  phone: "0587600807",
  email: "a0587600807@gmail.com",
  inspectorDeclarationText: "",
};

const baseCert = {
  id: 1,
  facilityName: "מתקן בדיקה",
  address: "בניין דוד 18",
  connectionSize: "3*80",
  groundingValue: "TT",
  insulation: "",
  notes: "הערות בדיקה",
  photos: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test("installation certificate PDF builds", async () => {
  const buf = await buildCertificatePdfBuffer({
    certificate: {
      ...baseCert,
      docType: "installation",
      extra: {
        ...defaultExtraForType("installation"),
        clientName: "פיצה אורי ביתר",
        installationType: "חנות / מסחרי",
        inspectionDate: "2026-04-16",
        techInspection: [
          { description: "לולאת תקלה (LT)", result: "0.44" },
          { description: "בידוד (L-PE)", result: "2.2" },
        ],
      },
    },
    inspector,
  });
  assert.ok(buf.length > 2000);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});

test("portable certificate PDF builds with appliance table", async () => {
  const buf = await buildCertificatePdfBuffer({
    certificate: {
      ...baseCert,
      docType: "portable",
      facilityName: "משרדי הייטק",
      extra: {
        ...defaultExtraForType("portable"),
        employerName: "חברת ABC",
        inspectionDate: "2026-05-01",
        appliances: [
          {
            assetId: "P-01",
            description: "מחשב נייד",
            location: "חדר 3",
            visualOk: "תקין",
            earthContinuity: "0.1",
            insulation: ">1M",
            leakage: "0.2mA",
            result: "תקין",
            nextTestDate: "2027-05-01",
          },
        ],
      },
    },
    inspector,
  });
  assert.ok(buf.length > 2000);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});

test("ev_charging certificate PDF builds", async () => {
  const buf = await buildCertificatePdfBuffer({
    certificate: {
      ...baseCert,
      docType: "ev_charging",
      facilityName: "חניון בית פרטי",
      groundingValue: "TN-S",
      extra: {
        ...defaultExtraForType("ev_charging"),
        ownerName: "ישראל ישראלי",
        stationManufacturer: "Wallbox",
        stationModel: "Pulsar Plus",
        stationSerial: "WB-12345",
        stationPowerKw: "22",
        chargeType: "AC",
        connectorType: "Type 2",
        inspectionDate: "2026-06-01",
      },
    },
    inspector,
  });
  assert.ok(buf.length > 2000);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});

test("ev_charging certificate PDF with Hebrew fields builds", async () => {
  const buf = await buildCertificatePdfBuffer({
    certificate: {
      ...baseCert,
      docType: "ev_charging",
      extra: {
        ...defaultExtraForType("ev_charging"),
        ownerName: "ישראל ישראלי",
        inspectionDate: "2026-06-22",
      },
    },
    inspector,
  });
  assert.ok(buf.length > 2000);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});

test("blank EV certificate renders on a single page", async () => {
  const blankPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const buf = await buildCertificatePdfBuffer({
    certificate: {
      ...baseCert,
      docType: "ev_charging",
      notes: "תקין",
      extra: {
        ...defaultExtraForType("ev_charging"),
        ownerName: "ישראל ישראלי",
        installerName: "אברהם",
        installerLicense: "123123",
        stationManufacturer: "100",
        stationModel: "500",
        stationSerial: "123123",
        stationPowerKw: "20",
        chargeType: "AC/DC",
        connectorType: "CCS",
        inspectionDate: "2026-06-22",
        importerDeclarationRef: "123456",
        importerDeclarationDate: "2026-06-14",
      },
    },
    inspector: {
      ...inspector,
      useBlankTemplate: true,
      blankTemplateData: blankPng,
      blankOffsetXmm: 0,
      blankOffsetYmm: 0,
      blankScale: 1,
    },
  });
  const raw = buf.toString("latin1");
  assert.ok(!raw.includes("\u05DE\u05EA\u05D5\u05DA 2"), "blank EV PDF should not span 2 pages");
  assert.ok(buf.length > 3000, "blank EV PDF should include title and stamp content");
});

test("certificate PDF with blank letterhead builds", async () => {
  const blankPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const stampPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAoCAYAAAAbr3KzAAAAFUlEQVR42mP8z5+hnoEIwDiqKJqQNgIA6K8B8uY7k5sAAAAASUVORK5CYII=";
  const buf = await buildCertificatePdfBuffer({
    certificate: {
      ...baseCert,
      docType: "ev_charging",
      extra: { ...defaultExtraForType("ev_charging"), inspectionDate: "2026-06-01" },
    },
    inspector: {
      ...inspector,
      useBlankTemplate: true,
      blankTemplateData: blankPng,
      blankOffsetXmm: 0,
      blankOffsetYmm: 0,
      blankScale: 1,
      stampData: stampPng,
    },
  });
  assert.ok(buf.length > 2000);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});
