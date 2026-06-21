import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import bidiFactory from "bidi-js";
import {
  CERT_TYPES,
  mergeExtraForType,
  normalizeDocType,
  defaultVisualChecklist,
  defaultTechRows,
} from "./lib/cert-types.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = path.join(__dirname, "public", "fonts", "NotoSansHebrew-Regular.ttf");

const bidi = bidiFactory();

/** Brand blue — aligned with formal inspection reports */
const BLUE = "#1a56b4";
const BLUE_DARK = "#0d3d82";
const GREY_PANEL = "#eceff1";
const GREY_TABLE_HEAD = "#dde3ea";
const BROWN_ACCENT = "#92400e";

function v(s) {
  if (s == null || s === "") return "";
  const str = String(s).replace(/\r\n/g, "\n");
  const emb = bidi.getEmbeddingLevels(str);
  return bidi.getReorderedString(str, emb);
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

function safeExtra(certificate) {
  const e = certificate?.extra;
  return e && typeof e === "object" ? e : {};
}

function fmtWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

function fmtDateOnly(val, fallbackIso) {
  if (val && typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    try {
      return new Date(`${val.trim()}T12:00:00`).toLocaleDateString("he-IL");
    } catch {
      return val.trim();
    }
  }
  if (val && String(val).trim()) return String(val).trim();
  if (!fallbackIso) return "";
  try {
    return new Date(fallbackIso).toLocaleDateString("he-IL");
  } catch {
    return "";
  }
}

function statusLabel(st) {
  const m = { draft: "טיוטה", final: "סופי" };
  return m[st] || st || "—";
}

function ensureY(doc, y, minBottom, need, m) {
  if (y + need <= minBottom) return y;
  doc.addPage();
  doc.font("Hebrew");
  return m.top;
}

/** Draw RTL text and return the Y position after the block. */
function rtlBlock(doc, text, x, y, width, opts = {}) {
  doc.text(v(text), x, y, { width, align: "right", ...opts });
  return doc.y;
}

function measureRtl(doc, text, width, opts = {}) {
  return doc.heightOfString(v(text), { width, align: "right", ...opts });
}

function drawGreyMetaPanel(doc, left, contentW, y, lines, fontSize = 9) {
  const pad = 10;
  const innerW = contentW - pad * 2;
  doc.fontSize(fontSize).fillColor("#334155");
  let innerH = 0;
  for (const line of lines) {
    innerH += measureRtl(doc, line, innerW) + 5;
  }
  if (lines.length > 0) innerH -= 5;
  const boxH = Math.max(36, innerH + pad * 2);
  doc.save();
  doc.roundedRect(left, y, contentW, boxH, 3).fill(GREY_PANEL);
  doc.restore();
  let by = y + pad;
  for (const line of lines) {
    by = rtlBlock(doc, line, left + pad, by, innerW) + 5;
  }
  return y + boxH + 12;
}

function drawCertificateHeader(doc, { left, contentW, y, inspector, mainTitle, legalSubtitle, logoBuf }) {
  const logoW = 52;
  const logoH = 52;
  const hasLogo = Boolean(logoBuf);
  const textW = hasLogo ? contentW - logoW - 12 : contentW;

  if (hasLogo) {
    try {
      doc.image(logoBuf, left + contentW - logoW, y, { width: logoW, height: logoH, fit: [logoW, logoH] });
    } catch {
      /* skip */
    }
  }

  doc.fontSize(10).fillColor(BLUE_DARK);
  rtlBlock(doc, inspector?.name || "—", left, y + 2, textW);
  doc.fontSize(8.8).fillColor("#334155");
  rtlBlock(doc, `רישיון מס': ${inspector?.licenseNo || "—"}`, left, doc.y + 2, textW);
  rtlBlock(doc, `טלפון: ${inspector?.phone || "—"}`, left, doc.y + 2, textW);
  const em = String(inspector?.email || "").trim();
  if (em) rtlBlock(doc, `דוא"ל: ${em}`, left, doc.y + 2, textW);
  let cursorY = Math.max(doc.y, y + (hasLogo ? logoH : 0)) + 12;

  const titleFs = String(mainTitle).length > 26 ? 14 : 16;
  doc.fontSize(titleFs).fillColor(BLUE);
  rtlBlock(doc, mainTitle, left, cursorY, contentW, { lineGap: 1 });
  cursorY = doc.y + 6;

  doc.fontSize(8.2).fillColor("#475569");
  rtlBlock(doc, legalSubtitle, left, cursorY, contentW, { lineGap: 1.5 });
  cursorY = doc.y + 10;

  doc.save();
  doc.moveTo(left, cursorY).lineTo(left + contentW, cursorY).lineWidth(3.5).strokeColor(BLUE).stroke();
  doc.restore();
  return cursorY + 14;
}

function defaultVisualChecklistLocal() {
  return defaultVisualChecklist();
}

function defaultTechRowsLocal() {
  return defaultTechRows();
}

function parseTechRows(extra, certificate) {
  let raw = extra.techInspection ?? extra.techRows;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((row) => ({
      description: String(row.description ?? row.label ?? row.d ?? "").trim(),
      result: String(row.result ?? row.value ?? row.r ?? "—").trim() || "—",
    }));
  }
  return defaultTechRows();
}

function parseVisualList(extra) {
  let raw = extra.visualChecklist ?? extra.visualItems;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  return defaultVisualChecklist();
}

/**
 * @param {{ certificate: object, inspector: object }} opts
 * @returns {Promise<Buffer>}
 */
export function buildCertificatePdfBuffer({ certificate, inspector }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const docType = normalizeDocType(certificate.docType);
    const typeMeta = CERT_TYPES[docType];
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      lang: "he-IL",
      bufferPages: true,
      info: {
        Title: typeMeta?.pdfTitle || "אישור תקינות חשמל",
        Author: inspector?.name || "",
        Subject: "אישור תקינות חשמל",
        Keywords: "חשמל, תקינות, בודק מוסמך",
      },
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      doc.registerFont("Hebrew", HEBREW_FONT);
    } catch (e) {
      reject(new Error(`Hebrew font missing: ${e.message}`));
      return;
    }
    doc.font("Hebrew");

    const pageH = doc.page.height;
    const m = doc.page.margins;
    const left = m.left;
    const contentW = doc.page.width - m.left - m.right;
    const bottomSafe = pageH - m.bottom - 48;
    let y = m.top;

    const extra = mergeExtraForType(docType, safeExtra(certificate));
    const docNo = String(extra.docNo || "").trim();
    const workflow = String(extra.workflowStatus || "").trim();

    const clientName = String(extra.clientName || "").trim() || "—";
    const installationType = String(extra.installationType || "").trim() || "—";
    const inspectionPurpose = String(extra.inspectionPurpose || "").trim() || "—";
    const inspectionDate = fmtDateOnly(extra.inspectionDate, certificate.updatedAt || certificate.createdAt);
    const finalBanner =
      String(extra.finalStatusBanner || "").trim() || "תקין — המתקן מאושר לשימוש";
    const legalSubtitle =
      String(extra.legalSubtitle || "").trim() ||
      "הבדיקה בוצעה בהתאם לחוק החשמל, תקנותיו, תקני מכון התקנים הישראלי ו-IEC הרלוונטיים";

    const logoBuf = dataUrlToBuffer(inspector?.logoData);
    const mainTitle = typeMeta?.pdfTitle || "אישור תקינות חשמל";

    y = drawCertificateHeader(doc, {
      left,
      contentW,
      y,
      inspector,
      mainTitle,
      legalSubtitle,
      logoBuf,
    });

    if (docType === "portable") {
      y = renderPortableBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, m, {
        docNo,
        workflow,
        inspectionDate,
      });
    } else if (docType === "ev_charging") {
      y = renderEvChargingBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, m, {
        docNo,
        workflow,
        inspectionDate,
      });
    } else {
      y = renderInstallationBody(
        doc,
        certificate,
        inspector,
        extra,
        left,
        contentW,
        y,
        bottomSafe,
        m,
        {
          clientName,
          installationType,
          inspectionPurpose,
          inspectionDate,
          finalBanner,
          docNo,
          workflow,
        }
      );
    }

    // ── Photos ─────────────────────────────────────────────────────
    const photos = Array.isArray(certificate.photos) ? certificate.photos : [];
    const maxImgW = contentW;
    const maxImgH = 170;
    for (let pi = 0; pi < photos.length; pi++) {
      const p = photos[pi];
      const b = dataUrlToBuffer(p?.data);
      if (!b) continue;
      y = ensureY(doc, y, bottomSafe, maxImgH + 36, m);
      doc.fontSize(9).fillColor("#475569");
      doc.text(v(`תיעוד ויזואלי — תמונה ${pi + 1}`), left, y, { width: contentW, align: "right" });
      y += 11;
      try {
        doc.image(b, left, y, { fit: [maxImgW, maxImgH], align: "center" });
        y += maxImgH + 12;
      } catch {
        y += 8;
      }
    }

    const range = doc.bufferedPageRange();
    const genTime = new Date().toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
    const footerBase = `הופק מהמערכת · מזהה ${certificate.id}${docNo ? ` · מס׳ ${docNo}` : ""} · ${genTime}`;
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font("Hebrew");
      doc.fontSize(7.2).fillColor("#94a3b8");
      doc.text(v(`${footerBase} · עמוד ${i + 1} מתוך ${range.count}`), left, pageH - m.bottom - 10, {
        width: contentW,
        align: "center",
      });
    }

    doc.end();
  });
}

function renderPortableBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, m, meta) {
  y = ensureY(doc, y, bottomSafe, 80, m);
  y = drawGreyMetaPanel(doc, left, contentW, y, [
    `תאריך בדיקה: ${meta.inspectionDate || "—"}    ·    מסמך: ${meta.docNo || "—"}${meta.workflow ? `    ·    סטטוס: ${statusLabel(meta.workflow)}` : ""}`,
    `מזמין / אתר: ${extra.employerName || certificate.facilityName || "—"}`,
    `כתובת / מיקום: ${certificate.address || "—"}`,
    `שיטת סימון: ${extra.markingMethod || "מדבקה עם תאריך בדיקה"}`,
  ]);

  const appliances = Array.isArray(extra.appliances) ? extra.appliances : [];
  const cols = [
    { label: "מס' נכס", key: "assetId", w: 0.1 },
    { label: "תיאור", key: "description", w: 0.16 },
    { label: "מיקום", key: "location", w: 0.12 },
    { label: "חזותי", key: "visualOk", w: 0.08 },
    { label: "הארקה", key: "earthContinuity", w: 0.1 },
    { label: "בידוד", key: "insulation", w: 0.1 },
    { label: "זליגה", key: "leakage", w: 0.1 },
    { label: "תוצאה", key: "result", w: 0.1 },
    { label: "בדיקה הבאה", key: "nextTestDate", w: 0.14 },
  ];
  const rows =
    appliances.length > 0
      ? appliances.map((a) =>
          cols.map((c) => String(a[c.key] ?? "—").trim() || "—")
        )
      : [["—", "לא הוזנו מכשירים", "—", "—", "—", "—", "—", "—", "—"]];
  y = drawMultiColumnTable(doc, left, contentW, y, bottomSafe, m, "טבלת מכשירים (PAT)", cols, rows);

  const summary =
    (extra.summary || "").trim() ||
    (certificate.notes || "").trim() ||
    "כל המכשירים שנבדקו עומדים בדרישות הבטיחות.";
  y = ensureY(doc, y, bottomSafe, 70, m);
  doc.fontSize(10).fillColor(BROWN_ACCENT);
  doc.moveTo(left, y).lineTo(left + 140, y).lineWidth(1).stroke(BROWN_ACCENT);
  y += 6;
  doc.fontSize(11).fillColor("#0f172a").text(v("מסקנה כללית"), left, y, { width: contentW, align: "right" });
  y += 12;
  doc.fontSize(9).fillColor("#1e293b");
  doc.text(v(summary), left + 8, y, { width: contentW - 16, align: "right", lineGap: 2 });
  y = doc.y + 14;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, m);
  return y;
}

function renderEvChargingBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, m, meta) {
  y = ensureY(doc, y, bottomSafe, 90, m);
  y = drawGreyMetaPanel(doc, left, contentW, y, [
    `תאריך בדיקה: ${meta.inspectionDate || "—"}    ·    מסמך: ${meta.docNo || "—"}${meta.workflow ? `    ·    סטטוס: ${statusLabel(meta.workflow)}` : ""}`,
    `בעלים: ${extra.ownerName || certificate.facilityName || "—"}`,
    `כתובת: ${certificate.address || "—"}    ·    סוג אתר: ${extra.siteKind || "פרטי"}`,
    `עמדה: ${extra.stationManufacturer || "—"} ${extra.stationModel || ""} · SN ${extra.stationSerial || "—"}`,
    `${extra.stationPowerKw || "—"} kW · ${extra.chargeType || "AC"} · ${extra.connectorType || "—"}`,
  ]);

  const importerLine = `הצהרת יבואן/יצרן: ${extra.importerDeclarationRef || "—"}${extra.importerDeclarationDate ? ` (${extra.importerDeclarationDate})` : ""}`;
  y = drawKeyValueTable(doc, left, contentW, y, bottomSafe, m, "פרטי עמדה ומתקין", [
    ["הצהרת יבואן", importerLine],
    ["מתקין", `${extra.installerName || "—"} · רישיון ${extra.installerLicense || "—"}`],
    ["תקן", extra.iec61851Ref || "IEC 61851-1 / IEC 60364-7-722"],
    ["הארקה / הגנה", certificate.groundingValue || "—"],
  ]);

  const checks = Array.isArray(extra.checks) ? extra.checks : [];
  const checkRows = checks.map((c) => [String(c.item || "—"), String(c.result || "—")]);
  y = drawMultiColumnTable(
    doc,
    left,
    contentW,
    y,
    bottomSafe,
    m,
    "בדיקות IEC 60364-7-722",
    [
      { label: "פריט", key: 0, w: 0.65 },
      { label: "תוצאה", key: 1, w: 0.35 },
    ],
    checkRows.length ? checkRows : [["—", "—"]],
    true
  );

  const periodic = Array.isArray(extra.periodicTests) ? extra.periodicTests : [];
  const pRows = periodic.map((p) => [
    String(p.test || "—"),
    String(p.frequency || "—"),
    String(p.lastDate || "—"),
    String(p.result || "—"),
  ]);
  y = drawMultiColumnTable(
    doc,
    left,
    contentW,
    y,
    bottomSafe,
    m,
    "טבלת תדירויות בדיקה",
    [
      { label: "בדיקה", key: 0, w: 0.4 },
      { label: "תדירות", key: 1, w: 0.2 },
      { label: "תאריך אחרון", key: 2, w: 0.2 },
      { label: "תוצאה", key: 3, w: 0.2 },
    ],
    pRows.length ? pRows : [["—", "—", "—", "—"]],
    true
  );

  const notes = (certificate.notes || "").trim();
  if (notes) {
    y = ensureY(doc, y, bottomSafe, 50, m);
    doc.fontSize(10).fillColor(BLUE_DARK).text(v("הערות"), left, y, { width: contentW, align: "right" });
    y += 12;
    doc.fontSize(9).fillColor("#334155");
    doc.text(v(notes), left, y, { width: contentW, align: "right", lineGap: 2 });
    y = doc.y + 12;
  }

  const gridBanner =
    String(extra.gridApprovalBanner || "").trim() || "מאושר לחיבור לרשת לפני הפעלה ראשונה";
  y = ensureY(doc, y, bottomSafe, 36, m);
  doc.save();
  doc.rect(left, y, contentW, 32).fill(BLUE);
  doc.restore();
  doc.fontSize(11.5).fillColor("#ffffff");
  doc.text(v(gridBanner), left, y + 9, { width: contentW, align: "center" });
  y += 40;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, m);
  return y;
}

function drawMultiColumnTable(doc, left, contentW, y, bottomSafe, m, title, cols, rows, rowsAreArrays = false) {
  y = ensureY(doc, y, bottomSafe, 28, m);
  doc.fontSize(10.5).fillColor(BLUE_DARK).text(v(title), left, y, { width: contentW, align: "right" });
  y += 12;
  const rowH = 18;
  const headerH = 20;
  const widths = cols.map((c) => contentW * c.w);
  y = ensureY(doc, y, bottomSafe, headerH + 4, m);
  doc.save();
  doc.rect(left, y, contentW, headerH).fill(GREY_TABLE_HEAD).stroke("#cbd5e1");
  doc.restore();
  doc.fontSize(7.5).fillColor("#334155");
  let hx = left + contentW;
  for (let i = 0; i < cols.length; i++) {
    hx -= widths[i];
    doc.text(v(cols[i].label), hx + 2, y + 5, { width: widths[i] - 4, align: "right" });
  }
  y += headerH;
  for (let ri = 0; ri < rows.length; ri++) {
    y = ensureY(doc, y, bottomSafe, rowH + 2, m);
    doc.save();
    doc.rect(left, y, contentW, rowH).fill(ri % 2 === 0 ? "#f8fafc" : "#ffffff").stroke("#e2e8f0");
    doc.restore();
    doc.fontSize(7.2).fillColor("#0f172a");
    const row = rows[ri];
    let rx = left + contentW;
    for (let ci = 0; ci < cols.length; ci++) {
      rx -= widths[ci];
      const cell = rowsAreArrays ? row[ci] : row[cols[ci].key];
      doc.text(v(String(cell ?? "—")), rx + 2, y + 4, { width: widths[ci] - 4, align: "right" });
    }
    y += rowH;
  }
  return y + 10;
}

function renderInstallationBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, m, meta) {
  y = ensureY(doc, y, bottomSafe, 90, m);
  y = drawGreyMetaPanel(doc, left, contentW, y, [
    `שם הלקוח: ${meta.clientName}    ·    תאריך בדיקה: ${meta.inspectionDate || "—"}`,
    `כתובת המתקן: ${certificate.address || "—"}    ·    סוג המתקן: ${meta.installationType}`,
    `מטרת בדיקה: ${meta.inspectionPurpose}    ·    מס׳ מסמך: ${meta.docNo || "—"}${meta.workflow ? ` · ${statusLabel(meta.workflow)}` : ""}`,
  ]);

  // נתוני חיבור ואספקה
  y = ensureY(doc, y, bottomSafe, 48, m);
  doc.fontSize(10.5).fillColor(BLUE_DARK).text(v("נתוני חיבור ואספקה"), left, y, { width: contentW, align: "right" });
  y = doc.y + 8;
  doc.fontSize(9.2).fillColor("#1e293b");
  const connExisting = String(extra.connectionExisting || certificate.connectionSize || "—").trim();
  const connRequested = String(extra.connectionRequested || "—").trim();
  const panelMeter = String(extra.panelMeterNo || "—").trim();
  rtlBlock(
    doc,
    `חיבור קיים: ${connExisting}    ·    חיבור מבוקש: ${connRequested}    ·    לוח/מונה: ${panelMeter}`,
    left,
    y,
    contentW
  );
  rtlBlock(
    doc,
    `שיטת הגנה: ${certificate.groundingValue || "—"}    ·    בידוד: ${certificate.insulation || "—"}`,
    left,
    doc.y + 4,
    contentW
  );
  y = doc.y + 10;

  // טבלת תוצאות בדיקה טכנית
  const techRows = parseTechRows(extra);
  y = drawTechFourColumnTable(doc, left, contentW, y, bottomSafe, m, techRows);

  // סיכום בדיקה ויזואלית
  const visual = parseVisualList(extra);
  y = ensureY(doc, y, bottomSafe, 28, m);
  doc.fontSize(10.5).fillColor(BLUE_DARK).text(v("סיכום בדיקה ויזואלית"), left, y, { width: contentW, align: "right" });
  y += 14;
  const half = Math.ceil(visual.length / 2);
  const leftCol = visual.slice(0, half);
  const rightCol = visual.slice(half);
  const colGap = 18;
  const innerW = (contentW - colGap) / 2;
  let yv = y;
  const rowH = 13;
  const maxRows = Math.max(leftCol.length, rightCol.length);
  for (let i = 0; i < maxRows; i++) {
    yv = ensureY(doc, yv, bottomSafe, rowH + 4, m);
    const a = leftCol[i];
    const b = rightCol[i];
    if (a) {
      doc.fontSize(8.6).fillColor("#1e293b");
      doc.text(v(`✓  ${a}`), left + innerW + colGap, yv, { width: innerW, align: "right" });
    }
    if (b) {
      doc.fontSize(8.6).fillColor("#1e293b");
      doc.text(v(`✓  ${b}`), left, yv, { width: innerW, align: "right" });
    }
    yv += rowH;
  }
  y = yv + 10;

  // מסקנות והערות
  const notes = (certificate.notes || "").trim() || "לא צוינו הערות.";
  y = ensureY(doc, y, bottomSafe, 80, m);
  doc.save();
  doc.moveTo(left, y).lineTo(left + 150, y).lineWidth(1.1).strokeColor(BROWN_ACCENT).stroke();
  doc.restore();
  y += 5;
  doc.fontSize(11).fillColor("#0f172a").text(v("מסקנות והערות"), left, y, { width: contentW, align: "right" });
  y += 12;
  const nh = Math.min(
    120,
    Math.max(36, doc.heightOfString(v(notes), { width: contentW - 20, align: "right", lineGap: 2 }) + 16)
  );
  y = ensureY(doc, y, bottomSafe, nh + 8, m);
  doc.save();
  doc.roundedRect(left, y, contentW, nh, 2).fill("#f1f5f9").stroke("#e2e8f0");
  doc.restore();
  doc.fontSize(9).fillColor("#334155");
  doc.text(v(notes), left + 10, y + 8, { width: contentW - 20, align: "right", lineGap: 2 });
  y += nh + 14;

  // באנר סטטוס
  y = ensureY(doc, y, bottomSafe, 36, m);
  doc.save();
  doc.rect(left, y, contentW, 32).fill(BLUE);
  doc.restore();
  doc.fontSize(12.5).fillColor("#ffffff");
  doc.text(v(meta.finalBanner), left, y + 8, { width: contentW, align: "center" });
  y += 40;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, m);
  return y;
}

function drawTechFourColumnTable(doc, left, contentW, y, bottomSafe, m, techRows) {
  y = ensureY(doc, y, bottomSafe, 36, m);
  doc.fontSize(10.5).fillColor(BLUE_DARK).text(v("תוצאות בדיקה טכנית"), left, y, { width: contentW, align: "right" });
  y += 14;

  const g = 6;
  const wDesc = (contentW - g * 3) * 0.28;
  const wRes = (contentW - g * 3) * 0.22;
  const rowH = 20;
  const headerH = 22;
  const headLabels = ["תיאור הבדיקה", "תוצאה", "תיאור הבדיקה", "תוצאה"];
  const headWs = [wDesc, wRes, wDesc, wRes];

  y = ensureY(doc, y, bottomSafe, headerH + 4, m);
  doc.save();
  doc.rect(left, y, contentW, headerH).fill(GREY_TABLE_HEAD).stroke("#cbd5e1");
  doc.restore();
  doc.fontSize(8.5).fillColor("#334155");
  let hx = left + contentW;
  for (let i = 0; i < 4; i++) {
    hx -= headWs[i];
    doc.text(v(headLabels[i]), hx + 2, y + 6, { width: headWs[i] - 4, align: "right" });
    hx -= g;
  }
  y += headerH;

  const pairs = techRows.map((r) => ({
    d: String(r.description || "—").trim() || "—",
    r: String(r.result || "—").trim() || "—",
  }));
  for (let i = 0; i < pairs.length; i += 2) {
    y = ensureY(doc, y, bottomSafe, rowH + 2, m);
    const p1 = pairs[i];
    const p2 = pairs[i + 1];
    doc.save();
    doc.rect(left, y, contentW, rowH).fill(i % 4 === 0 ? "#f8fafc" : "#ffffff").stroke("#e2e8f0");
    doc.restore();
    doc.fontSize(8.3).fillColor("#0f172a");
    const cells = [
      { t: p1.d, w: wDesc },
      { t: p1.r, w: wRes },
      { t: p2 ? p2.d : "", w: wDesc },
      { t: p2 ? p2.r : "", w: wRes },
    ];
    let rx = left + contentW;
    for (const c of cells) {
      rx -= c.w;
      doc.text(v(c.t || "—"), rx + 2, y + 5, { width: c.w - 4, align: "right" });
      rx -= g;
    }
    y += rowH;
  }
  return y + 10;
}

function drawKeyValueTable(doc, left, contentW, y, bottomSafe, m, title, rows) {
  y = ensureY(doc, y, bottomSafe, 28, m);
  doc.fontSize(10.5).fillColor(BLUE_DARK).text(v(title), left, y, { width: contentW, align: "right" });
  y += 12;
  const rowH = 22;
  for (let i = 0; i < rows.length; i++) {
    const [label, val] = rows[i];
    y = ensureY(doc, y, bottomSafe, rowH + 2, m);
    doc.save();
    doc.rect(left, y, contentW, rowH).fill(i % 2 === 0 ? "#f8fafc" : "#fff").stroke("#e2e8f0");
    doc.restore();
    doc.fontSize(8.5).fillColor("#64748b");
    doc.text(v(label), left + contentW - 130, y + 6, { width: 120, align: "right" });
    doc.fontSize(9).fillColor("#0f172a");
    doc.text(v(String(val)), left + 10, y + 5, { width: contentW - 150, align: "right" });
    y += rowH;
  }
  return y + 8;
}

function drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, m) {
  const decl = String(inspector?.inspectorDeclarationText || "").trim();
  const declText =
    decl ||
    "אני החתום מטה מצהיר כי בדקתי את המתקן האמור לעיל בהתאם להוראות חוק החשמל, תשי״ד–1954, ותקנותיו, וכי המתקן עומד בדרישות התקן הישראלי ובהנחיות רשות החשמל.";

  y = ensureY(doc, y, bottomSafe, 120, m);
  const midX = left + contentW / 2;
  const colW = contentW / 2 - 8;
  doc.fontSize(10).fillColor(BLUE_DARK).text(v("הצהרת החשמלאי"), midX + 4, y, {
    width: colW - 4,
    align: "right",
  });
  doc.fontSize(10).fillColor(BLUE_DARK).text(v("חתימה וחותמת החשמלאי"), left, y, {
    width: colW - 4,
    align: "right",
  });
  y += 14;

  doc.fontSize(7.8).fillColor("#334155");
  const declH =
    doc.heightOfString(v(declText), { width: colW - 8, align: "right", lineGap: 1.5 }) + 4;
  doc.text(v(declText), midX + 4, y, {
    width: colW - 8,
    align: "right",
    lineGap: 1.5,
  });

  const sigBuf = dataUrlToBuffer(certificate.signatureData);
  const stampBuf = dataUrlToBuffer(inspector?.stampData);
  const mmToPt = 2.83465;
  const offX = Number(inspector?.stampOffsetXmm || 0) * mmToPt;
  const offY = Number(inspector?.stampOffsetYmm || 0) * mmToPt;
  const sigTop = y;
  if (sigBuf) {
    try {
      doc.image(sigBuf, left + 8, sigTop, { width: 130, height: 52, fit: [130, 52] });
    } catch {
      /* skip */
    }
  }
  if (stampBuf) {
    try {
      const stampX = left + colW - 100 - offX;
      doc.image(stampBuf, stampX, sigTop + offY, { width: 92, height: 72, fit: [92, 72] });
    } catch {
      /* skip */
    }
  }
  doc.fontSize(7).fillColor("#94a3b8");
  doc.text(v("חתימה דיגיטלית / סריקה"), left + 8, sigTop + 56, { width: 130, align: "center" });

  y += Math.max(declH, 78) + 12;
  return y;
}
