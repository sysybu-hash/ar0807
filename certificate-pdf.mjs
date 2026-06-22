import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import {
  CERT_TYPES,
  mergeExtraForType,
  normalizeDocType,
  defaultVisualChecklist,
  defaultTechRows,
} from "./lib/cert-types.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = path.join(__dirname, "public", "fonts", "NotoSansHebrew-Regular.ttf");
const LATIN_FONT = path.join(__dirname, "public", "fonts", "NotoSans-Regular.ttf");

/** Brand blue — aligned with formal inspection reports */
const BLUE = "#1a56b4";
const BLUE_DARK = "#0d3d82";
const GREY_PANEL = "#eceff1";
const GREY_TABLE_HEAD = "#dde3ea";
const BROWN_ACCENT = "#92400e";

const MM_TO_PT = 72 / 25.4;

/** Content box on Rubinstein A4 letterhead (mm from page edges). */
const BLANK_LETTERHEAD = {
  contentTopMm: 72,
  contentBottomMm: 28,
  sideMm: 14,
  signatureMm: 58,
};

function mmToPt(mm) {
  return Number(mm || 0) * MM_TO_PT;
}

function buildPdfLayout(doc, useBlank) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const m = doc.page.margins;
  if (!useBlank) {
    return {
      useBlank: false,
      singlePage: false,
      compact: false,
      left: m.left,
      contentW: pageW - m.left - m.right,
      contentTop: m.top,
      bottomSafe: pageH - m.bottom - 48,
      signatureReserve: 0,
    };
  }
  const side = mmToPt(BLANK_LETTERHEAD.sideMm);
  const top = mmToPt(BLANK_LETTERHEAD.contentTopMm);
  const bottom = mmToPt(BLANK_LETTERHEAD.contentBottomMm);
  return {
    useBlank: true,
    singlePage: true,
    compact: true,
    left: side,
    contentW: pageW - side * 2,
    contentTop: top,
    bottomSafe: pageH - bottom,
    signatureReserve: mmToPt(BLANK_LETTERHEAD.signatureMm),
  };
}

function normalizePdfText(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/\r\n/g, "\n")
    .replace(/\u2014/g, "-")
    .replace(/\u00B7/g, "|")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

function isHebrewChar(ch) {
  return /[\u0590-\u05FF]/.test(ch);
}

function splitScriptRuns(text) {
  const runs = [];
  let buf = "";
  let kind = null;
  for (const ch of text) {
    const k = isHebrewChar(ch) ? "hebrew" : "latin";
    if (kind !== null && k !== kind && buf) {
      runs.push({ kind, text: buf });
      buf = "";
    }
    kind = k;
    buf += ch;
  }
  if (buf) runs.push({ kind, text: buf });
  return runs;
}

/** PDFKit is LTR — keep logical Hebrew in the PDF stream; Hebrew runs use OpenType rtla. */
function buildLogicalRuns(text) {
  return splitScriptRuns(normalizePdfText(text)).map((run) => ({
    kind: run.kind,
    font: run.kind === "hebrew" ? "Hebrew" : "Latin",
    text: run.text,
  }));
}

function runTextOpts(run) {
  return run.kind === "hebrew" ? { features: ["rtla"] } : {};
}

function measureRunWidth(doc, run, fontSize) {
  doc.font(run.font).fontSize(fontSize);
  return doc.widthOfString(run.text, runTextOpts(run));
}

/** Split script runs into word/space tokens so PDFKit does not lay out words LTR inside a line. */
function buildLineTokens(text) {
  const tokens = [];
  for (const run of buildLogicalRuns(text)) {
    const parts = run.text.split(/(\s+)/).filter((part) => part.length > 0);
    for (const part of parts) {
      tokens.push({
        kind: /^\s+$/.test(part) ? "space" : run.kind,
        font: run.font,
        text: part,
      });
    }
  }
  return tokens;
}

function measureTokenWidth(doc, token, fontSize) {
  doc.font(token.font).fontSize(fontSize);
  return doc.widthOfString(token.text, token.kind === "hebrew" ? runTextOpts(token) : {});
}

function drawLogicalRtlLine(doc, text, x, y, width, opts = {}) {
  if (!text) return y;
  const fontSize = resolveFontSize(doc, opts);
  const fillColor = resolveFillColor(doc, opts);
  doc.fontSize(fontSize).fillColor(fillColor);

  const tokens = buildLineTokens(text);
  if (tokens.length === 0) return y + lineHeight(doc, fontSize, opts);

  const sized = tokens.map((token) => ({
    ...token,
    w: measureTokenWidth(doc, token, fontSize),
  }));
  const total = sized.reduce((sum, token) => sum + token.w, 0);
  let px = opts.align === "center" ? x + (width + total) / 2 : x + width;

  for (const token of sized) {
    doc.font(token.font).fontSize(fontSize).fillColor(fillColor);
    px -= token.w;
    doc.text(token.text, px, y, {
      lineBreak: false,
      width: Math.max(token.w, 1),
      ...(token.kind === "hebrew" ? runTextOpts(token) : {}),
    });
  }
  return y + lineHeight(doc, fontSize, opts);
}

function measureLogicalLine(doc, text, opts = {}) {
  const fontSize = resolveFontSize(doc, opts);
  return buildLineTokens(text).reduce((sum, token) => sum + measureTokenWidth(doc, token, fontSize), 0);
}

/** Break a single paragraph into lines that fit within `width`. */
function wrapLogicalLines(doc, text, width, opts = {}) {
  const normalized = normalizePdfText(text);
  if (!normalized) return [""];
  if (!width || width <= 0) return [normalized];
  if (measureLogicalLine(doc, normalized, opts) <= width) return [normalized];

  const tokens = normalized.split(/(\s+)/).filter((t) => t.length > 0);
  const lines = [];
  let current = "";
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (current) current += token;
      continue;
    }
    const trial = current ? `${current}${token}` : token;
    if (current.trim() && measureLogicalLine(doc, trial, opts) > width) {
      lines.push(current.trim());
      current = token.trim() ? token : "";
    } else {
      current = trial;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.length ? lines : [normalized];
}

function expandWrappedLines(doc, text, width, opts = {}) {
  const { wrap = true, ...rest } = opts;
  const paragraphs = normalizePdfText(text).split("\n");
  const lines = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    if (wrap && width > 0) {
      lines.push(...wrapLogicalLines(doc, para, width, rest));
    } else {
      lines.push(para);
    }
  }
  return lines.length ? lines : [""];
}

function lineHeight(doc, fontSize, opts = {}) {
  if (opts.lineGap != null) return fontSize + opts.lineGap;
  return fontSize * 1.25;
}

function resolveFillColor(doc, opts) {
  if (opts.fillColor) return opts.fillColor;
  if (typeof doc._fillColor === "string") return doc._fillColor;
  if (Array.isArray(doc._fillColor) && typeof doc._fillColor[0] === "string") return doc._fillColor[0];
  return "#000000";
}

function resolveFontSize(doc, opts) {
  const size = opts.fontSize ?? doc._fontSize ?? 12;
  return Number.isFinite(size) ? size : 12;
}

function drawBlankPageBackground(doc, inspector) {
  const buf = dataUrlToBuffer(inspector?.blankTemplateData);
  if (!inspector?.useBlankTemplate || !buf) return false;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const scale = Math.min(1.2, Math.max(0.8, Number(inspector.blankScale || 1)));
  const ox = mmToPt(inspector.blankOffsetXmm || 0);
  const oy = mmToPt(inspector.blankOffsetYmm || 0);
  const boxW = pageW * scale;
  const boxH = pageH * scale;
  doc.save();
  doc.image(buf, -ox, -oy, { width: boxW, height: boxH });
  doc.restore();
  return true;
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

function formatIsraelPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("05")) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith("0")) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  const trimmed = String(phone || "").trim();
  return trimmed || "—";
}

function inspectorStampName(inspector) {
  const full = String(inspector?.name || "").trim();
  if (!full) return "—";
  const short = full.split(/\s*[-–—]\s*/)[0]?.trim();
  return short || full;
}

function drawBlankDocumentTitle(doc, left, contentW, y, mainTitle, legalSubtitle) {
  const titleFs = String(mainTitle).length > 30 ? 10.5 : 12;
  doc.fontSize(titleFs).fillColor(BLUE_DARK);
  let cy = pdfText(doc, mainTitle, left, y, contentW, { align: "center", fontSize: titleFs, lineGap: 0.5 });
  if (legalSubtitle) {
    doc.fontSize(7).fillColor("#64748b");
    cy = pdfText(doc, legalSubtitle, left, cy + 3, contentW, {
      align: "center",
      fontSize: 7,
      lineGap: 0.5,
    });
  }
  doc.save();
  doc.moveTo(left + contentW * 0.12, cy + 6)
    .lineTo(left + contentW * 0.88, cy + 6)
    .lineWidth(1.4)
    .strokeColor(BLUE)
    .stroke();
  doc.restore();
  return cy + 14;
}

function drawInspectorStampVector(doc, inspector, x, y, width, height) {
  doc.save();
  doc.rect(x, y, width, height).fill("#ffffff");
  doc.lineWidth(1.1).strokeColor(BLUE);
  doc.rect(x + 2, y + 2, width - 4, height - 4).stroke();
  doc.lineWidth(0.55);
  doc.rect(x + 5, y + 5, width - 10, height - 10).stroke();
  doc.restore();

  const padX = 6;
  const innerW = width - padX * 2;
  const name = inspectorStampName(inspector);
  const lic = String(inspector?.licenseNo || "").trim();
  const licLine = lic ? `חשמלאי ראשי מ.ר. ${lic}` : "חשמלאי ראשי";
  const phoneLine = `טלפון: ${formatIsraelPhone(inspector?.phone)}`;

  doc.fillColor(BLUE);
  let ty = y + 5;
  ty = pdfText(doc, name, x + padX, ty, innerW, { align: "center", fontSize: 8.5 }) + 1;
  ty = pdfText(doc, licLine, x + padX, ty, innerW, { align: "center", fontSize: 6.3 }) + 0.5;
  pdfText(doc, phoneLine, x + padX, ty, innerW, { align: "center", fontSize: 6.3 });
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

function ensureY(doc, y, minBottom, need, layout) {
  if (y + need <= minBottom) return y;
  if (layout?.singlePage) return y;
  doc.addPage();
  doc.font("Hebrew");
  return layout?.contentTop ?? doc._pdfContentTop ?? doc.page.margins.top;
}

/** Draw RTL text and return the Y position after the block. */
function rtlBlock(doc, text, x, y, width, opts = {}) {
  return pdfText(doc, text, x, y, width, { align: "right", ...opts });
}

function measureRtl(doc, text, width, opts = {}) {
  const fontSize = resolveFontSize(doc, opts);
  const lines = expandWrappedLines(doc, text, width, opts);
  let h = 0;
  for (let i = 0; i < lines.length; i++) {
    h += lineHeight(doc, fontSize, opts);
    if (i < lines.length - 1) h += opts.lineGap ?? 0;
  }
  return Math.max(h, lineHeight(doc, fontSize, opts));
}

function pdfText(doc, text, x, y, width, opts = {}) {
  const { lineGap = 0, wrap = true, ...rest } = opts;
  const lines = expandWrappedLines(doc, text, width, { ...rest, wrap });
  let cy = y;
  for (let i = 0; i < lines.length; i++) {
    cy = drawLogicalRtlLine(doc, lines[i], x, cy, width, rest);
    if (i < lines.length - 1) cy += lineGap;
  }
  doc.y = cy;
  doc.font("Hebrew");
  return cy;
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

function drawCertificateHeader(doc, { left, contentW, y, inspector, mainTitle, legalSubtitle, logoBuf, skipLetterhead, blankMode }) {
  if (blankMode) {
    return drawBlankDocumentTitle(doc, left, contentW, y, mainTitle, legalSubtitle);
  }

  const logoW = 52;
  const logoH = 52;
  const hasLogo = Boolean(logoBuf) && !skipLetterhead;
  const textW = hasLogo ? contentW - logoW - 12 : contentW;

  if (hasLogo) {
    try {
      doc.image(logoBuf, left + contentW - logoW, y, { width: logoW, height: logoH, fit: [logoW, logoH] });
    } catch {
      /* skip */
    }
  }

  let cursorY = y;
  if (!skipLetterhead) {
    doc.fontSize(10).fillColor(BLUE_DARK);
    rtlBlock(doc, inspector?.name || "—", left, y + 2, textW);
    doc.fontSize(8.8).fillColor("#334155");
    rtlBlock(doc, `רישיון מס': ${inspector?.licenseNo || "—"}`, left, doc.y + 2, textW);
    rtlBlock(doc, `טלפון: ${inspector?.phone || "—"}`, left, doc.y + 2, textW);
    const em = String(inspector?.email || "").trim();
    if (em) rtlBlock(doc, `דוא"ל: ${em}`, left, doc.y + 2, textW);
    cursorY = Math.max(doc.y, y + (hasLogo ? logoH : 0)) + 12;
  }

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
      doc.registerFont("Latin", LATIN_FONT);
    } catch (e) {
      reject(new Error(`PDF fonts missing: ${e.message}`));
      return;
    }
    doc.font("Hebrew");

    const pageH = doc.page.height;
    const m = doc.page.margins;
    const useBlank = drawBlankPageBackground(doc, inspector);
    const layout = buildPdfLayout(doc, useBlank);
    if (useBlank) {
      doc.on("pageAdded", () => drawBlankPageBackground(doc, inspector));
      doc._pdfContentTop = layout.contentTop;
    }
    const left = layout.left;
    const contentW = layout.contentW;
    const bottomSafe = layout.bottomSafe;
    let y = layout.contentTop;

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
      skipLetterhead: useBlank,
      blankMode: useBlank,
    });

    if (docType === "portable") {
      y = renderPortableBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, {
        docNo,
        workflow,
        inspectionDate,
      });
    } else if (docType === "ev_charging") {
      y = renderEvChargingBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, {
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
        layout,
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

    const photos = Array.isArray(certificate.photos) ? certificate.photos : [];
    if (!layout.singlePage && photos.length > 0) {
      const maxImgW = contentW;
      const maxImgH = 170;
      for (let pi = 0; pi < photos.length; pi++) {
        const p = photos[pi];
        const b = dataUrlToBuffer(p?.data);
        if (!b) continue;
        y = ensureY(doc, y, bottomSafe, maxImgH + 36, layout);
        doc.fontSize(9).fillColor("#475569");
        pdfText(doc, `תיעוד ויזואלי — תמונה ${pi + 1}`, left, y, contentW, { align: "right" });
        y += 11;
        try {
          doc.image(b, left, y, { fit: [maxImgW, maxImgH], align: "center" });
          y += maxImgH + 12;
        } catch {
          y += 8;
        }
      }
    }

    const range = doc.bufferedPageRange();
    const genTime = new Date().toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
    const footerBase = `הופק מהמערכת · מזהה ${certificate.id}${docNo ? ` · מס׳ ${docNo}` : ""} · ${genTime}`;
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      if (layout.useBlank && range.count === 1) continue;
      doc.font("Hebrew");
      doc.fontSize(7.2).fillColor("#94a3b8");
      pdfText(doc, `${footerBase} · עמוד ${i + 1} מתוך ${range.count}`, left, pageH - m.bottom - 10, contentW, { align: "center", });
    }

    doc.end();
  });
}

function renderPortableBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta) {
  if (layout.compact) {
    return renderPortableBodyCompact(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta);
  }
  y = ensureY(doc, y, bottomSafe, 80, layout);
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
  y = drawMultiColumnTable(doc, left, contentW, y, bottomSafe, layout, "טבלת מכשירים (PAT)", cols, rows);

  const summary =
    (extra.summary || "").trim() ||
    (certificate.notes || "").trim() ||
    "כל המכשירים שנבדקו עומדים בדרישות הבטיחות.";
  y = ensureY(doc, y, bottomSafe, 70 + estimateSignatureFooterHeight(doc, inspector, contentW), layout);
  doc.fontSize(10).fillColor(BROWN_ACCENT);
  doc.moveTo(left, y).lineTo(left + 140, y).lineWidth(1).stroke(BROWN_ACCENT);
  y += 6;
  doc.fontSize(11).fillColor("#0f172a"); pdfText(doc, "מסקנה כללית", left, y, contentW, { align: "right" });
  y += 12;
  doc.fontSize(9).fillColor("#1e293b");
  pdfText(doc, summary, left + 8, y, contentW - 16, { align: "right", lineGap: 2 });
  y = doc.y + 14;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, layout);
  return y;
}

function renderPortableBodyCompact(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta) {
  const bodyBottom = bottomSafe - layout.signatureReserve;
  const gap = 3;
  doc.fontSize(7.5).fillColor("#334155");
  y =
    rtlBlock(
      doc,
      `תאריך: ${meta.inspectionDate || "—"} · מסמך: ${meta.docNo || "—"} · ${statusLabel(meta.workflow)}`,
      left,
      y,
      contentW
    ) + gap;
  y =
    rtlBlock(
      doc,
      `מזמין: ${extra.employerName || certificate.facilityName || "—"} · ${certificate.address || "—"}`,
      left,
      y,
      contentW
    ) + gap;
  const appliances = Array.isArray(extra.appliances) ? extra.appliances : [];
  const cols = [
    { label: "מס'", key: "assetId", w: 0.1 },
    { label: "תיאור", key: "description", w: 0.22 },
    { label: "מיקום", key: "location", w: 0.14 },
    { label: "תוצאה", key: "result", w: 0.12 },
    { label: "הבאה", key: "nextTestDate", w: 0.14 },
  ];
  const rows =
    appliances.length > 0
      ? appliances.slice(0, 8).map((a) => cols.map((c) => String(a[c.key] ?? "—").trim() || "—"))
      : [["—", "לא הוזנו מכשירים", "—", "—", "—"]];
  y = drawMultiColumnTable(doc, left, contentW, y, bodyBottom, layout, "מכשירים", cols, rows, true, { compact: true });
  const summary = (extra.summary || certificate.notes || "תקין").trim();
  doc.fontSize(7.5).fillColor("#1e293b");
  y = rtlBlock(doc, `מסקנה: ${summary}`, left, y, contentW) + 4;
  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, bodyBottom, bottomSafe, layout, {
    compact: true,
    fixedY: true,
  });
  return y;
}

function renderEvChargingBodyCompact(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta) {
  const bodyBottom = bottomSafe - layout.signatureReserve;
  const gap = 3;
  doc.fontSize(7.5).fillColor("#334155");
  y =
    rtlBlock(
      doc,
      `תאריך בדיקה: ${meta.inspectionDate || "—"} · מסמך: ${meta.docNo || "—"} · ${statusLabel(meta.workflow)}`,
      left,
      y,
      contentW
    ) + gap;
  y =
    rtlBlock(
      doc,
      `בעלים: ${extra.ownerName || certificate.facilityName || "—"} · כתובת: ${certificate.address || "—"} · ${extra.siteKind || "פרטי"}`,
      left,
      y,
      contentW
    ) + gap;
  y =
    rtlBlock(
      doc,
      `עמדה: ${extra.stationManufacturer || "—"} ${extra.stationModel || ""} · SN ${extra.stationSerial || "—"} · ${extra.stationPowerKw || "—"}kW ${extra.chargeType || "AC"} ${extra.connectorType || "—"}`,
      left,
      y,
      contentW
    ) + gap;

  const importerVal = `${extra.importerDeclarationRef || "—"}${extra.importerDeclarationDate ? ` (${extra.importerDeclarationDate})` : ""}`;
  y = drawCompactKeyValue(doc, left, contentW, y, [
    ["הצהרת יבואן/יצרן", importerVal],
    ["מתקין", `${extra.installerName || "—"} · רישיון ${extra.installerLicense || "—"}`],
    ["תקן", extra.iec61851Ref || "IEC 61851-1"],
    ["הארקה / הגנה", certificate.groundingValue || "—"],
  ]);

  const checks = Array.isArray(extra.checks) ? extra.checks : [];
  const checkRows = checks.map((c) => [String(c.item || "—"), String(c.result || "—")]);
  y = drawMultiColumnTable(
    doc,
    left,
    contentW,
    y,
    bodyBottom,
    layout,
    "בדיקות IEC 60364-7-722",
    [
      { label: "פריט", key: 0, w: 0.65 },
      { label: "תוצאה", key: 1, w: 0.35 },
    ],
    checkRows.length ? checkRows : [["—", "—"]],
    true,
    { compact: true }
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
    bodyBottom,
    layout,
    "תדירויות בדיקה",
    [
      { label: "בדיקה", key: 0, w: 0.42 },
      { label: "תדירות", key: 1, w: 0.18 },
      { label: "אחרון", key: 2, w: 0.18 },
      { label: "תוצאה", key: 3, w: 0.22 },
    ],
    pRows.length ? pRows : [["—", "—", "—", "—"]],
    true,
    { compact: true }
  );

  const notes = (certificate.notes || "").trim();
  if (notes && y < bodyBottom - 28) {
    doc.fontSize(7.2).fillColor("#334155");
    y = rtlBlock(doc, `הערות: ${notes}`, left, y, contentW) + 2;
  }

  const statusLine =
    String(extra.gridApprovalBanner || "").trim() ||
    String(extra.finalStatusBanner || "").trim() ||
    "תקין — מאושר לשימוש";
  if (y < bodyBottom - 16) {
    doc.fontSize(7.8).fillColor(BLUE_DARK);
    y = rtlBlock(doc, statusLine, left, y, contentW) + 2;
  }

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, bodyBottom, bottomSafe, layout, {
    compact: true,
    fixedY: true,
  });
  return y;
}

function renderEvChargingBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta) {
  if (layout.compact) {
    return renderEvChargingBodyCompact(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta);
  }
  y = ensureY(doc, y, bottomSafe, 90, layout);
  y = drawGreyMetaPanel(doc, left, contentW, y, [
    `תאריך בדיקה: ${meta.inspectionDate || "—"}    ·    מסמך: ${meta.docNo || "—"}${meta.workflow ? `    ·    סטטוס: ${statusLabel(meta.workflow)}` : ""}`,
    `בעלים: ${extra.ownerName || certificate.facilityName || "—"}`,
    `כתובת: ${certificate.address || "—"}    ·    סוג אתר: ${extra.siteKind || "פרטי"}`,
    `עמדה: ${extra.stationManufacturer || "—"} ${extra.stationModel || ""} · SN ${extra.stationSerial || "—"}`,
    `${extra.stationPowerKw || "—"} kW · ${extra.chargeType || "AC"} · ${extra.connectorType || "—"}`,
  ]);

  const importerVal = `${extra.importerDeclarationRef || "—"}${extra.importerDeclarationDate ? ` (${extra.importerDeclarationDate})` : ""}`;
  y = drawKeyValueTable(doc, left, contentW, y, bottomSafe, layout, "פרטי עמדה ומתקין", [
    ["הצהרת יבואן/יצרן", importerVal],
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
    layout,
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
    layout,
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
    y = ensureY(doc, y, bottomSafe, 50, layout);
    doc.fontSize(10).fillColor(BLUE_DARK); pdfText(doc, "הערות", left, y, contentW, { align: "right" });
    y += 12;
    doc.fontSize(9).fillColor("#334155");
    pdfText(doc, notes, left, y, contentW, { align: "right", lineGap: 2 });
    y = doc.y + 12;
  }

  const gridBanner =
    String(extra.gridApprovalBanner || "").trim() || "מאושר לחיבור לרשת לפני הפעלה ראשונה";
  const closingH = 40 + estimateSignatureFooterHeight(doc, inspector, contentW);
  y = ensureY(doc, y, bottomSafe, closingH, layout);
  doc.save();
  doc.rect(left, y, contentW, 32).fill(BLUE);
  doc.restore();
  doc.fontSize(11.5).fillColor("#ffffff");
  pdfText(doc, gridBanner, left, y + 9, contentW, { align: "center" });
  y += 40;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, layout, {
    skipEnsureY: true,
  });
  return y;
}

function drawMultiColumnTable(
  doc,
  left,
  contentW,
  y,
  bottomSafe,
  layout,
  title,
  cols,
  rows,
  rowsAreArrays = false,
  tableOpts = {}
) {
  const compact = tableOpts.compact ?? layout?.compact ?? false;
  const minRowH = compact ? 10 : 16;
  const headerH = compact ? 13 : 20;
  const cellFs = compact ? 6.8 : 7.2;
  const headFs = compact ? 6.8 : 7.5;
  const titleFs = compact ? 8.5 : 10.5;
  const titleGap = compact ? 4 : 8;
  const tailGap = compact ? 6 : 8;

  if (y >= bottomSafe - headerH - 4) return y;
  y = ensureY(doc, y, bottomSafe, 20, layout);
  doc.fontSize(titleFs).fillColor(BLUE_DARK);
  const titleEndY = pdfText(doc, title, left, y, contentW, { align: "right", fontSize: titleFs });
  y = titleEndY + titleGap;
  const widths = cols.map((c) => contentW * c.w);
  y = ensureY(doc, y, bottomSafe, headerH + 4, layout);
  doc.save();
  doc.rect(left, y, contentW, headerH).fill(GREY_TABLE_HEAD).stroke("#cbd5e1");
  doc.restore();
  doc.fontSize(headFs).fillColor("#334155");
  let hx = left + contentW;
  for (let i = 0; i < cols.length; i++) {
    hx -= widths[i];
    pdfText(doc, cols[i].label, hx + 2, y + (compact ? 3 : 5), widths[i] - 4, { align: "right" });
  }
  y += headerH;
  for (let ri = 0; ri < rows.length; ri++) {
    if (y + minRowH > bottomSafe - 2) break;
    const row = rows[ri];
    let rowH = minRowH;
    const cellTexts = [];
    for (let ci = 0; ci < cols.length; ci++) {
      const cell = String(rowsAreArrays ? row[ci] : row[cols[ci].key] ?? "—");
      cellTexts.push(cell);
      const cellH = measureRtl(doc, cell, widths[ci] - 4, { fontSize: cellFs, align: "right" }) + (compact ? 4 : 8);
      rowH = Math.max(rowH, cellH);
    }
    y = ensureY(doc, y, bottomSafe, rowH + 2, layout);
    doc.save();
    doc.rect(left, y, contentW, rowH).fill(ri % 2 === 0 ? "#f8fafc" : "#ffffff").stroke("#e2e8f0");
    doc.restore();
    doc.fontSize(cellFs).fillColor("#0f172a");
    let rx = left + contentW;
    for (let ci = 0; ci < cols.length; ci++) {
      rx -= widths[ci];
      pdfText(doc, cellTexts[ci], rx + 2, y + (compact ? 2 : 4), widths[ci] - 4, { align: "right" });
    }
    y += rowH;
  }
  return y + tailGap;
}

function drawCompactKeyValue(doc, left, contentW, y, rows) {
  const labelW = 108;
  const valW = contentW - labelW - 8;
  const valX = left;
  const labelX = left + contentW - labelW;
  for (let i = 0; i < rows.length; i++) {
    const [label, val] = rows[i];
    const rowH = 11;
    doc.fontSize(6.8).fillColor("#64748b");
    pdfText(doc, label, labelX, y + 1, labelW, { align: "right" });
    doc.fontSize(7).fillColor("#0f172a");
    pdfText(doc, String(val ?? "—"), valX, y + 1, valW, { align: "right" });
    y += rowH;
  }
  return y + 2;
}

function renderInstallationBodyCompact(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta) {
  const bodyBottom = bottomSafe - layout.signatureReserve;
  const gap = 3;
  doc.fontSize(7.5).fillColor("#334155");
  y =
    rtlBlock(
      doc,
      `לקוח: ${meta.clientName} · תאריך: ${meta.inspectionDate || "—"} · ${meta.installationType}`,
      left,
      y,
      contentW
    ) + gap;
  y =
    rtlBlock(
      doc,
      `כתובת: ${certificate.address || "—"} · מטרה: ${meta.inspectionPurpose}`,
      left,
      y,
      contentW
    ) + gap;
  const connExisting = String(extra.connectionExisting || certificate.connectionSize || "—").trim();
  y =
    rtlBlock(
      doc,
      `חיבור: ${connExisting} · הגנה: ${certificate.groundingValue || "—"} · בידוד: ${certificate.insulation || "—"}`,
      left,
      y,
      contentW
    ) + gap;

  const techRows = parseTechRows(extra);
  y = drawTechFourColumnTable(doc, left, contentW, y, bodyBottom, layout, techRows, { compact: true });

  const visual = parseVisualList(extra);
  const half = Math.ceil(visual.length / 2);
  const leftCol = visual.slice(0, half);
  const rightCol = visual.slice(half);
  const colGap = 10;
  const innerW = (contentW - colGap) / 2;
  let yv = y;
  const rowH = 9;
  for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
    const a = leftCol[i];
    const b = rightCol[i];
    if (a) {
      doc.fontSize(6.8).fillColor("#1e293b");
      pdfText(doc, `+ ${a}`, left + innerW + colGap, yv, innerW, { align: "right" });
    }
    if (b) {
      doc.fontSize(6.8).fillColor("#1e293b");
      pdfText(doc, `+ ${b}`, left, yv, innerW, { align: "right" });
    }
    yv += rowH;
  }
  y = yv + 2;

  const notes = (certificate.notes || "").trim();
  if (notes) {
    doc.fontSize(7.2).fillColor("#334155");
    y = rtlBlock(doc, `הערות: ${notes}`, left, y, contentW) + 2;
  }
  doc.fontSize(7.8).fillColor(BLUE_DARK);
  y = rtlBlock(doc, meta.finalBanner, left, y, contentW) + 2;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, bodyBottom, bottomSafe, layout, {
    compact: true,
    fixedY: true,
  });
  return y;
}

function renderInstallationBody(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta) {
  if (layout.compact) {
    return renderInstallationBodyCompact(doc, certificate, inspector, extra, left, contentW, y, bottomSafe, layout, meta);
  }
  y = ensureY(doc, y, bottomSafe, 90, layout);
  y = drawGreyMetaPanel(doc, left, contentW, y, [
    `שם הלקוח: ${meta.clientName}    ·    תאריך בדיקה: ${meta.inspectionDate || "—"}`,
    `כתובת המתקן: ${certificate.address || "—"}    ·    סוג המתקן: ${meta.installationType}`,
    `מטרת בדיקה: ${meta.inspectionPurpose}    ·    מס׳ מסמך: ${meta.docNo || "—"}${meta.workflow ? ` · ${statusLabel(meta.workflow)}` : ""}`,
  ]);

  // נתוני חיבור ואספקה
  y = ensureY(doc, y, bottomSafe, 48, layout);
  doc.fontSize(10.5).fillColor(BLUE_DARK); pdfText(doc, "נתוני חיבור ואספקה", left, y, contentW, { align: "right" });
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
  y = drawTechFourColumnTable(doc, left, contentW, y, bottomSafe, layout, techRows);

  // סיכום בדיקה ויזואלית
  const visual = parseVisualList(extra);
  y = ensureY(doc, y, bottomSafe, 28, layout);
  doc.fontSize(10.5).fillColor(BLUE_DARK); pdfText(doc, "סיכום בדיקה ויזואלית", left, y, contentW, { align: "right" });
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
    yv = ensureY(doc, yv, bottomSafe, rowH + 4, layout);
    const a = leftCol[i];
    const b = rightCol[i];
    if (a) {
      doc.fontSize(8.6).fillColor("#1e293b");
      pdfText(doc, `+  ${a}`, left + innerW + colGap, yv, innerW, { align: "right" });
    }
    if (b) {
      doc.fontSize(8.6).fillColor("#1e293b");
      pdfText(doc, `+  ${b}`, left, yv, innerW, { align: "right" });
    }
    yv += rowH;
  }
  y = yv + 10;

  // מסקנות והערות
  const notes = (certificate.notes || "").trim() || "לא צוינו הערות.";
  y = ensureY(doc, y, bottomSafe, 80, layout);
  doc.save();
  doc.moveTo(left, y).lineTo(left + 150, y).lineWidth(1.1).strokeColor(BROWN_ACCENT).stroke();
  doc.restore();
  y += 5;
  doc.fontSize(11).fillColor("#0f172a"); pdfText(doc, "מסקנות והערות", left, y, contentW, { align: "right" });
  y += 12;
  const nh = Math.min(
    120,
    Math.max(36, measureRtl(doc, notes, contentW - 20, { align: "right", lineGap: 2 }) + 16)
  );
  y = ensureY(doc, y, bottomSafe, nh + 8, layout);
  doc.save();
  doc.roundedRect(left, y, contentW, nh, 2).fill("#f1f5f9").stroke("#e2e8f0");
  doc.restore();
  doc.fontSize(9).fillColor("#334155");
  pdfText(doc, notes, left + 10, y + 8, contentW - 20, { align: "right", lineGap: 2 });
  y += nh + 14;

  // באנר סטטוס
  const closingH = 40 + estimateSignatureFooterHeight(doc, inspector, contentW);
  y = ensureY(doc, y, bottomSafe, closingH, layout);
  doc.save();
  doc.rect(left, y, contentW, 32).fill(BLUE);
  doc.restore();
  doc.fontSize(12.5).fillColor("#ffffff");
  pdfText(doc, meta.finalBanner, left, y + 8, contentW, { align: "center" });
  y += 40;

  y = drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, layout, {
    skipEnsureY: true,
  });
  return y;
}

function drawTechFourColumnTable(doc, left, contentW, y, bottomSafe, layout, techRows, tableOpts = {}) {
  const compact = tableOpts.compact ?? layout?.compact ?? false;
  const rowH = compact ? 11 : 20;
  const headerH = compact ? 13 : 22;
  const titleFs = compact ? 8.5 : 10.5;
  const cellFs = compact ? 6.8 : 8.3;
  const headFs = compact ? 6.8 : 8.5;

  y = ensureY(doc, y, bottomSafe, 24, layout);
  doc.fontSize(titleFs).fillColor(BLUE_DARK);
  pdfText(doc, "תוצאות בדיקה טכנית", left, y, contentW, { align: "right" });
  y += compact ? 5 : 14;

  const g = 6;
  const wDesc = (contentW - g * 3) * 0.28;
  const wRes = (contentW - g * 3) * 0.22;
  const headLabels = ["תיאור הבדיקה", "תוצאה", "תיאור הבדיקה", "תוצאה"];
  const headWs = [wDesc, wRes, wDesc, wRes];

  y = ensureY(doc, y, bottomSafe, headerH + 4, layout);
  doc.save();
  doc.rect(left, y, contentW, headerH).fill(GREY_TABLE_HEAD).stroke("#cbd5e1");
  doc.restore();
  doc.fontSize(headFs).fillColor("#334155");
  let hx = left + contentW;
  for (let i = 0; i < 4; i++) {
    hx -= headWs[i];
    pdfText(doc, headLabels[i], hx + 2, y + 6, headWs[i] - 4, { align: "right" });
    hx -= g;
  }
  y += headerH;

  const pairs = techRows.map((r) => ({
    d: String(r.description || "—").trim() || "—",
    r: String(r.result || "—").trim() || "—",
  }));
  for (let i = 0; i < pairs.length; i += 2) {
    y = ensureY(doc, y, bottomSafe, rowH + 2, layout);
    const p1 = pairs[i];
    const p2 = pairs[i + 1];
    doc.save();
    doc.rect(left, y, contentW, rowH).fill(i % 4 === 0 ? "#f8fafc" : "#ffffff").stroke("#e2e8f0");
    doc.restore();
    doc.fontSize(cellFs).fillColor("#0f172a");
    const cells = [
      { t: p1.d, w: wDesc },
      { t: p1.r, w: wRes },
      { t: p2 ? p2.d : "", w: wDesc },
      { t: p2 ? p2.r : "", w: wRes },
    ];
    let rx = left + contentW;
    for (const c of cells) {
      rx -= c.w;
      pdfText(doc, c.t || "—", rx + 2, y + 5, c.w - 4, { align: "right" });
      rx -= g;
    }
    y += rowH;
  }
  return y + 10;
}

function drawKeyValueTable(doc, left, contentW, y, bottomSafe, layout, title, rows) {
  y = ensureY(doc, y, bottomSafe, 28, layout);
  doc.fontSize(10.5).fillColor(BLUE_DARK);
  pdfText(doc, title, left, y, contentW, { align: "right" });
  y += 12;
  const labelW = 128;
  const valW = contentW - labelW - 16;
  const valX = left + 8;
  const labelX = left + contentW - labelW - 4;
  for (let i = 0; i < rows.length; i++) {
    const [label, val] = rows[i];
    const valStr = String(val ?? "—");
    const rowH = Math.max(22, measureRtl(doc, valStr, valW, { fontSize: 9, align: "right" }) + 10);
    y = ensureY(doc, y, bottomSafe, rowH + 2, layout);
    doc.save();
    doc.rect(left, y, contentW, rowH).fill(i % 2 === 0 ? "#f8fafc" : "#fff").stroke("#e2e8f0");
    doc.restore();
    doc.fontSize(8.5).fillColor("#64748b");
    pdfText(doc, label, labelX, y + 6, labelW, { align: "right" });
    doc.fontSize(9).fillColor("#0f172a");
    pdfText(doc, valStr, valX, y + 5, valW, { align: "right" });
    y += rowH;
  }
  return y + 8;
}

function defaultDeclarationText() {
  return "אני החתום מטה מצהיר כי בדקתי את המתקן האמור לעיל בהתאם להוראות חוק החשמל, תשי״ד–1954, ותקנותיו, וכי המתקן עומד בדרישות התקן הישראלי ובהנחיות רשות החשמל.";
}

function estimateSignatureFooterHeight(doc, inspector, contentW) {
  const decl = String(inspector?.inspectorDeclarationText || "").trim() || defaultDeclarationText();
  const colW = contentW / 2 - 8;
  const declH = measureRtl(doc, decl, colW - 8, { fontSize: 7.8, align: "right", lineGap: 1.5 });
  return 14 + Math.max(declH, 78) + 16;
}

function drawSignatureFooter(doc, certificate, inspector, left, contentW, y, bottomSafe, layout, opts = {}) {
  const compact = !!opts.compact;
  const declText = String(inspector?.inspectorDeclarationText || "").trim() || defaultDeclarationText();
  const blockH = compact ? layout.signatureReserve : estimateSignatureFooterHeight(doc, inspector, contentW);

  if (opts.fixedY) {
    y = bottomSafe - layout.signatureReserve;
  } else if (!opts.skipEnsureY) {
    y = ensureY(doc, y, bottomSafe, blockH, layout);
  }

  const midX = left + contentW / 2;
  const sigColW = contentW / 2 - 6;
  const declColW = sigColW;
  const titleFs = compact ? 7.5 : 10;
  const declFs = compact ? 6.5 : 7.8;
  const declOpts = { fontSize: declFs, align: "right", lineGap: compact ? 0.5 : 1.5 };
  const bodyY = y + (compact ? 10 : 14);

  doc.fontSize(titleFs).fillColor(BLUE_DARK);
  pdfText(doc, "הצהרת החשמלאי", midX + 2, y, declColW - 2, { align: "right", fontSize: titleFs });
  pdfText(doc, "חתימה וחותמת החשמלאי", left, y, sigColW - 2, { align: "right", fontSize: titleFs });

  doc.fontSize(declFs).fillColor("#334155");
  const declEndY = pdfText(doc, declText, midX + 2, bodyY, declColW - 4, declOpts);

  const sigBuf = dataUrlToBuffer(certificate.signatureData);
  const stampBuf = dataUrlToBuffer(inspector?.stampData);
  const mmToPtLocal = 2.83465;
  const offX = Number(inspector?.stampOffsetXmm || 0) * mmToPtLocal;
  const offY = Number(inspector?.stampOffsetYmm || 0) * mmToPtLocal;
  const sigW = compact ? 96 : 130;
  const sigH = compact ? 38 : 52;
  if (sigBuf) {
    try {
      doc.image(sigBuf, left + 6, bodyY, { width: sigW, height: sigH, fit: [sigW, sigH] });
    } catch {
      /* skip */
    }
  }

  const stampW = compact ? 124 : 150;
  const stampH = compact ? 40 : 48;
  const stampX = left + 4;
  const stampY = bodyY + (sigBuf ? sigH + 5 : 0);
  const hasInspectorStampInfo = Boolean(
    inspectorStampName(inspector) !== "—" ||
      String(inspector?.licenseNo || "").trim() ||
      String(inspector?.phone || "").trim()
  );

  if (hasInspectorStampInfo) {
    drawInspectorStampVector(doc, inspector, stampX + offX, stampY + offY, stampW, stampH);
  } else if (stampBuf) {
    try {
      doc.image(stampBuf, stampX + offX, stampY + offY, { fit: [stampW, stampH], align: "left", valign: "top" });
    } catch {
      /* skip */
    }
  }
  if (!compact) {
    doc.fontSize(7).fillColor("#94a3b8");
    pdfText(doc, "חתימה דיגיטלית / סריקה", left + 8, bodyY + 56, 130, { align: "center" });
  }

  return compact ? bottomSafe - 2 : Math.max(declEndY, bodyY + 78) + 12;
}
