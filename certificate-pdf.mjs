import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import bidiFactory from "bidi-js";

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

function defaultVisualChecklist() {
  return [
    "הידוק חיבורים בלוח",
    "דרגת הגנה IP",
    "אין חלקים חיים חשופים",
    "צבעי מוליכים לפי התקן",
    "רציפות הארקה",
  ];
}

function defaultTechRows() {
  return [
    { description: "לולאת תקלה (LT)", result: "—" },
    { description: "בידוד (L-PE)", result: "—" },
    { description: "בידוד (N-PE)", result: "—" },
    { description: "ממסר פחת (זמן)", result: "—" },
    { description: "זרם הקפצה (mA)", result: "—" },
  ];
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
    const isPortable = certificate.docType === "portable";
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      lang: "he-IL",
      bufferPages: true,
      info: {
        Title: isPortable ? "אישור צרכנים מטלטלים" : "אישור תקינות מתקן חשמל",
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

    const extra = safeExtra(certificate);
    const docNo = String(extra.docNo || "").trim();
    const workflow = String(extra.workflowStatus || "").trim();

    const clientName = String(extra.clientName || "").trim() || "—";
    const installationType = String(extra.installationType || "").trim() || "—";
    const inspectionDate = fmtDateOnly(extra.inspectionDate, certificate.updatedAt || certificate.createdAt);
    const finalBanner =
      String(extra.finalStatusBanner || "").trim() || "תקין - המתקן מאושר לשימוש";
    const legalSubtitle = String(extra.legalSubtitle || "").trim() || "נערך בהתאם לחוק החשמל ותקנותיו";

    const logoBuf = dataUrlToBuffer(inspector?.logoData);
    const logoSlot = logoBuf ? 56 : 0;

    // ── Header (inspector left block, title right — RTL layout) ─
    const headerH = Math.max(logoSlot ? 62 : 52, 72);
    const split = contentW * 0.44;
    const gap = contentW * 0.04;
    const titleW = contentW - split - gap;

    if (logoBuf) {
      try {
        doc.image(logoBuf, left, y, { width: 52, height: 52, fit: [52, 52] });
      } catch {
        /* skip */
      }
    }

    const insX = left + logoSlot + 4;
    const insW = split - logoSlot - 8;
    let iy = y + 4;
    doc.fontSize(10).fillColor(BLUE_DARK);
    doc.text(v(inspector?.name || "—"), insX, iy, { width: insW, align: "right" });
    iy += 13;
    doc.fontSize(8.8).fillColor("#334155");
    doc.text(v(`רישיון מס': ${inspector?.licenseNo || "—"}`), insX, iy, { width: insW, align: "right" });
    iy += 11;
    doc.text(v(`טלפון: ${inspector?.phone || "—"}`), insX, iy, { width: insW, align: "right" });
    iy += 11;
    const em = String(inspector?.email || "").trim();
    if (em) {
      doc.text(v(`דוא"ל: ${em}`), insX, iy, { width: insW, align: "right" });
      iy += 11;
    }

    const titleX = left + split + gap;
    const mainTitle = isPortable ? "אישור צרכנים מטלטלים" : "אישור תקינות מתקן חשמל";
    doc.fontSize(17).fillColor(BLUE).text(v(mainTitle), titleX, y + 6, {
      width: titleW,
      align: "right",
    });
    doc.fontSize(8.6).fillColor("#475569").text(v(legalSubtitle), titleX, y + 30, {
      width: titleW,
      align: "right",
      lineGap: 2,
    });

    y += headerH + 4;
    doc.save();
    doc.moveTo(left, y).lineTo(left + contentW, y).lineWidth(3.5).strokeColor(BLUE).stroke();
    doc.restore();
    y += 14;

    if (isPortable) {
      y = renderPortableBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, m, {
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
  const pad = 10;
  const boxH = 52;
  y = ensureY(doc, y, bottomSafe, boxH + 40, m);
  doc.save();
  doc.roundedRect(left, y, contentW, boxH, 3).fill(GREY_PANEL);
  doc.restore();
  let by = y + pad;
  doc.fontSize(9).fillColor("#334155");
  doc.text(
    v(
      `תאריך בדיקה: ${meta.inspectionDate || "—"}    ·    מסמך: ${meta.docNo || "—"}    ·    ${meta.workflow ? `סטטוס: ${statusLabel(meta.workflow)}` : ""}`
    ),
    left + pad,
    by,
    { width: contentW - pad * 2, align: "right" }
  );
  by += 14;
  doc.text(v(`מתקן / ציוד: ${certificate.facilityName || "—"}`), left + pad, by, {
    width: contentW - pad * 2,
    align: "right",
  });
  by += 14;
  doc.text(v(`כתובת / אתר: ${certificate.address || "—"}`), left + pad, by, {
    width: contentW - pad * 2,
    align: "right",
  });
  y += boxH + 12;

  const rows = [
    ["גודל חיבור / הזנה", certificate.connectionSize || "—"],
    ["הארקה ושיטת הגנה", certificate.groundingValue || "—"],
    ["בידוד והגנות", certificate.insulation || "—"],
    ["עודכן", fmtWhen(certificate.updatedAt || certificate.createdAt)],
  ];
  y = drawKeyValueTable(doc, left, contentW, y, bottomSafe, m, "פרטי הציוד", rows);

  const notes = (certificate.notes || "").trim() || "לא צוינו הערות.";
  y = ensureY(doc, y, bottomSafe, 70, m);
  doc.fontSize(10).fillColor(BROWN_ACCENT);
  doc.moveTo(left, y).lineTo(left + 140, y).lineWidth(1).stroke(BROWN_ACCENT);
  y += 6;
  doc.fontSize(11).fillColor("#0f172a").text(v("הערות"), left, y, { width: contentW, align: "right" });
  y += 12;
  doc.save();
  doc.roundedRect(left, y, contentW, Math.min(100, doc.heightOfString(v(notes), { width: contentW - 16, align: "right" }) + 16), 2).fill("#f1f5f9");
  doc.restore();
  y += 8;
  doc.fontSize(9).fillColor("#1e293b");
  doc.text(v(notes), left + 8, y, { width: contentW - 16, align: "right", lineGap: 2 });
  y = doc.y + 14;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, m);
  return y;
}

function renderInstallationBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, m, meta) {
  const pad = 12;
  const boxH = 68;
  y = ensureY(doc, y, bottomSafe, boxH + 24, m);
  doc.save();
  doc.roundedRect(left, y, contentW, boxH, 3).fill(GREY_PANEL);
  doc.restore();

  const mid = left + contentW / 2;
  const colW = contentW / 2 - pad * 2;
  let y1 = y + pad;
  doc.fontSize(9).fillColor("#334155");
  doc.text(v(`שם הלקוח: ${meta.clientName}`), mid + pad / 2, y1, { width: colW, align: "right" });
  doc.text(v(`תאריך בדיקה: ${meta.inspectionDate || "—"}`), left + pad / 2, y1, { width: colW, align: "right" });
  y1 += 14;
  doc.text(v(`כתובת המתקן: ${certificate.address || "—"}`), mid + pad / 2, y1, { width: colW, align: "right" });
  doc.text(v(`סוג המתקן: ${meta.installationType}`), left + pad / 2, y1, { width: colW, align: "right" });
  y += boxH + 14;

  // נתוני חיבור ואספקה
  y = ensureY(doc, y, bottomSafe, 36, m);
  doc.fontSize(10.5).fillColor(BLUE_DARK).text(v("נתוני חיבור ואספקה"), left, y, { width: contentW, align: "right" });
  y += 13;
  doc.fontSize(9.2).fillColor("#1e293b");
  const connLine = `גודל חיבור: ${certificate.connectionSize || "—"}    ·    שיטת הגנה: ${certificate.groundingValue || "—"}`;
  doc.text(v(connLine), left, y, { width: contentW, align: "right" });
  y += 18;

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
