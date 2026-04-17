import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import bidiFactory from "bidi-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = path.join(__dirname, "public", "fonts", "NotoSansHebrew-Regular.ttf");

const bidi = bidiFactory();

/** PDFKit draws LTR; reorder for correct Hebrew / mixed display. */
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

function docTitle(docType) {
  return docType === "portable" ? "אישור צרכנים מטלטלים" : "אישור תקינות מתקן";
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

function statusLabel(st) {
  const m = { draft: "טיוטה", final: "סופי" };
  return m[st] || st || "—";
}

/**
 * Hebrew paragraph: right-aligned block (natural for RTL readers in PDF viewers).
 * Returns height consumed (approximate, matches PDFKit wrapping).
 */
function para(
  doc,
  raw,
  x,
  y,
  width,
  fontSize,
  { fillColor = "#0f172a", lineGap = 2, minHeight = 0 } = {}
) {
  const text = v(raw);
  doc.fontSize(fontSize).fillColor(fillColor);
  const h = doc.heightOfString(text, { width, align: "right", lineGap });
  const useH = Math.max(minHeight, h);
  doc.text(text, x, y, { width, align: "right", lineGap });
  return useH;
}

function docTypeLong(dt) {
  if (dt === "portable") return "אישור בדיקת ציוד חשמלי מטלטל (צרכנים מטלטלים)";
  return "אישור בדיקת תקינות התקנה חשמלית קבועה (לפי דרישות רשות החשמל והתקן)";
}

/**
 * @param {{ certificate: object, inspector: object }} opts
 * @returns {Promise<Buffer>}
 */
export function buildCertificatePdfBuffer({ certificate, inspector }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      lang: "he-IL",
      bufferPages: true,
      info: {
        Title: docTitle(certificate.docType),
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

    const pageW = doc.page.width;
    const m = doc.page.margins;
    const contentW = pageW - m.left - m.right;
    const left = m.left;
    let y = m.top;

    const extra = certificate.extra && typeof certificate.extra === "object" ? certificate.extra : {};
    const docNo = String(extra.docNo || "").trim();
    const workflow = String(extra.workflowStatus || "").trim();

    // ── Top bar ───────────────────────────────────────────────────
    doc.save();
    doc.rect(left, y, contentW, 5).fill("#0f172a");
    doc.restore();
    y += 16;

    const mainTitle = docTitle(certificate.docType);
    doc.fontSize(18).fillColor("#0f172a");
    doc.text(v(mainTitle), left, y, { width: contentW, align: "center" });
    y += 22;

    doc.fontSize(9.5).fillColor("#475569");
    y += para(
      doc,
      docTypeLong(certificate.docType),
      left,
      y,
      contentW,
      9.5,
      { lineGap: 1.5 }
    );
    y += 8;

    doc.fontSize(8.8).fillColor("#64748b");
    y += para(
      doc,
      "מסמך זה מהווה תיעוד מקצועי לצורכי ביקורת, ביטוח ותאגידים. יש לשמור עותק מודפס או דיגיטלי חתום לפי נהלי המשרד.",
      left,
      y,
      contentW,
      8.8,
      { lineGap: 1.5 }
    );
    y += 12;

    // ── Meta block (stacked lines — avoids one broken long line) ─
    doc.save();
    doc.roundedRect(left, y, contentW, 42, 2).fill("#f1f5f9");
    doc.restore();
    let my = y + 8;
    const metaLines = [
      `מזהה רשומה במערכת: ${certificate.id}`,
      docNo ? `מספר מסמך: ${docNo}` : null,
      workflow ? `סטטוס עבודה: ${statusLabel(workflow)}` : null,
      `עודכן לאחרונה: ${fmtWhen(certificate.updatedAt || certificate.createdAt)}`,
    ].filter(Boolean);
    doc.fontSize(8.5).fillColor("#334155");
    for (const line of metaLines) {
      doc.text(v(line), left + 10, my, { width: contentW - 20, align: "right" });
      my += 11;
    }
    y += 48;

    // ── Inspector strip (RTL: text block right, logo left in reading order = logo on physical left) ─
    const logoBuf = dataUrlToBuffer(inspector?.logoData);
    const stripH = logoBuf ? 78 : 64;
    doc.save();
    doc.roundedRect(left, y, contentW, stripH, 2).stroke("#cbd5e1");
    doc.restore();

    const textPad = 12;
    const logoSlot = logoBuf ? 118 : 0;
    const textW = contentW - textPad * 2 - logoSlot;

    if (logoBuf) {
      try {
        doc.image(logoBuf, left + textPad, y + 4, {
          width: 110,
          height: 48,
          fit: [110, 48],
        });
      } catch {
        /* skip */
      }
    }

    let ty = y + 10;
    doc.fontSize(11.5).fillColor("#0f172a");
    doc.text(v(inspector?.name || "—"), left + textPad + logoSlot, ty, {
      width: textW,
      align: "right",
    });
    ty += 16;
    doc.save();
    const licBarW = Math.min(textW, 280);
    doc.roundedRect(left + textPad + logoSlot + textW - licBarW, ty - 2, licBarW, 20, 2).fill("#fffbeb");
    doc.restore();
    doc.fontSize(10.5).fillColor("#b45309");
    doc.text(v(`מספר רישיון בודק: ${inspector?.licenseNo || "—"}`), left + textPad + logoSlot, ty, {
      width: textW,
      align: "right",
    });
    ty += 20;
    doc.fontSize(9).fillColor("#475569");
    doc.text(v(`טלפון: ${inspector?.phone || "—"}`), left + textPad + logoSlot, ty, {
      width: textW,
      align: "right",
    });
    y += stripH + 14;

    // ── Section: facility details (RTL table — labels on the right) ─
    doc.fontSize(12).fillColor("#0f172a");
    doc.text(v("פרטי המתקן והבדיקה"), left, y, { width: contentW, align: "right" });
    y += 14;

    const when = fmtWhen(certificate.updatedAt || certificate.createdAt);
    const rows = [
      ["שם המתקן / אתר", certificate.facilityName || "—"],
      ["כתובת", certificate.address || "—"],
      ["גודל חיבור / הזנה", certificate.connectionSize || "—"],
      ["הארקה ושיטת הגנה", certificate.groundingValue || "—"],
      ["בידוד והגנות", certificate.insulation || "—"],
      ["תאריך עדכון אחרון", when],
    ];

    const labelW = 128;
    const gap = 10;
    const valW = contentW - labelW - gap * 2;
    const rowH = 24;

    for (let i = 0; i < rows.length; i++) {
      const [label, val] = rows[i];
      doc.save();
      doc.rect(left, y, contentW, rowH).fill(i % 2 === 0 ? "#f8fafc" : "#ffffff");
      doc.rect(left, y, contentW, rowH).stroke("#e2e8f0");
      doc.restore();

      doc.fontSize(8.8).fillColor("#64748b");
      doc.text(v(label), left + contentW - labelW - gap, y + 7, {
        width: labelW - 6,
        align: "right",
      });
      doc.fontSize(9.5).fillColor("#0f172a");
      doc.text(v(String(val)), left + gap, y + 6, {
        width: valW,
        align: "right",
      });
      y += rowH;
    }
    y += 14;

    // ── Notes (flow across pages — no fixed box clipping) ───────
    doc.fontSize(11).fillColor("#0f172a");
    doc.text(v("הערות בודק / ממצאים"), left, y, { width: contentW, align: "right" });
    y += 12;

    const notesRaw = (certificate.notes || "").trim() || "לא צוינו הערות נוספות.";
    const notesV = v(notesRaw);
    const innerPad = 10;
    const innerW = contentW - innerPad * 2;

    doc.save();
    doc.moveTo(left, y).lineTo(left + contentW, y).lineWidth(2).stroke("#f59e0b");
    doc.restore();
    y += 10;

    doc.fontSize(9.5).fillColor("#1e293b");
    doc.text(notesV, left + innerPad, y, {
      width: innerW,
      align: "right",
      lineGap: 2,
    });
    y = doc.y + 14;

    // ── Inspector declaration ─────────────────────────────────────
    const decl = String(inspector?.inspectorDeclarationText || "").trim();
    if (decl) {
      if (y > doc.page.height - 140) {
        doc.addPage();
        y = m.top;
        doc.font("Hebrew");
      }
      doc.fontSize(11).fillColor("#0f172a");
      doc.text(v("הצהרת בודק מוסמך"), left, y, { width: contentW, align: "right" });
      y += 12;
      doc.fontSize(9).fillColor("#334155");
      y += para(doc, decl, left, y, contentW, 9, { lineGap: 2 });
      y += 12;
    }

    // ── Boilerplate (professional legal context) ────────────────
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = m.top;
      doc.font("Hebrew");
    }
    doc.fontSize(8.5).fillColor("#64748b");
    y += para(
      doc,
      "הבודק קיבע את ממצאי הבדיקה לפי ידע מקצועי וציוד מדידה מתאים. אחריות המזמין והמתקין ליישום תיקונים נדרשים ובטיחות שימוש במתקן.",
      left,
      y,
      contentW,
      8.5,
      { lineGap: 1.5 }
    );
    y += 10;

    // ── Photos ────────────────────────────────────────────────────
    const photos = Array.isArray(certificate.photos) ? certificate.photos : [];
    const maxImgW = contentW;
    const maxImgH = 190;
    for (let pi = 0; pi < photos.length; pi++) {
      const p = photos[pi];
      const b = dataUrlToBuffer(p?.data);
      if (!b) continue;
      if (y + maxImgH + 40 > doc.page.height - m.bottom - 70) {
        doc.addPage();
        y = m.top;
        doc.font("Hebrew");
      }
      doc.fontSize(9).fillColor("#475569");
      doc.text(v(`תיעוד ויזואלי — תמונה ${pi + 1}`), left, y, {
        width: contentW,
        align: "right",
      });
      y += 12;
      try {
        doc.image(b, left, y, {
          fit: [maxImgW, maxImgH],
          align: "center",
        });
        y += maxImgH + 14;
      } catch {
        y += 10;
      }
    }

    // ── Signature & stamp ───────────────────────────────────────
    if (y > doc.page.height - 130) {
      doc.addPage();
      y = m.top;
      doc.font("Hebrew");
    }

    doc.fontSize(10).fillColor("#0f172a");
    doc.text(v("חתימת הבודק וחותמת"), left, y, { width: contentW, align: "right" });
    y += 12;

    const sigBuf = dataUrlToBuffer(certificate.signatureData);
    const stampBuf = dataUrlToBuffer(inspector?.stampData);
    const mmToPt = 2.83465;
    const offX = Number(inspector?.stampOffsetXmm || 0) * mmToPt;
    const offY = Number(inspector?.stampOffsetYmm || 0) * mmToPt;

    const sigRowH = 78;
    const stampW = 100;
    const stampH = 72;
    const sigW = 150;
    const sigH = 60;

    doc.save();
    doc.roundedRect(left, y, contentW, sigRowH + 10, 2).fill("#f8fafc").stroke("#e2e8f0");
    doc.restore();

    const rowTop = y + 8;
    // RTL: stamp (official seal) on visual right; signature on visual left
    if (stampBuf) {
      try {
        const stampX = left + contentW - stampW - 16 - offX;
        doc.image(stampBuf, stampX, rowTop + offY, {
          width: stampW,
          height: stampH,
          fit: [stampW, stampH],
        });
      } catch {
        /* ignore */
      }
    }
    if (sigBuf) {
      try {
        doc.image(sigBuf, left + 16, rowTop, {
          width: sigW,
          height: sigH,
          fit: [sigW, sigH],
        });
      } catch {
        /* ignore */
      }
    }
    doc.fontSize(7.5).fillColor("#94a3b8");
    doc.text(v("חתימה דיגיטלית / סריקה"), left + 16, rowTop + sigH + 2, {
      width: sigW,
      align: "center",
    });
    y += sigRowH + 28;

    const genTime = new Date().toLocaleString("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const footerBase = `הופק מהמערכת · מזהה מסמך ${certificate.id} · הדפסה: ${genTime}`;

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font("Hebrew");
      doc.fontSize(7.3).fillColor("#94a3b8");
      doc.text(v(footerBase + ` · עמוד ${i + 1} מתוך ${range.count}`), left, doc.page.height - m.bottom - 8, {
        width: contentW,
        align: "center",
      });
    }

    doc.end();
  });
}
