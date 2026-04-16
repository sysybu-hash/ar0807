import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = path.join(__dirname, "public", "fonts", "NotoSansHebrew-Regular.ttf");

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
    return new Date(iso).toLocaleString("he-IL");
  } catch {
    return String(iso);
  }
}

/**
 * @param {{ certificate: object, inspector: { name?: string, licenseNo?: string, phone?: string } }} opts
 * @returns {Promise<Buffer>}
 */
export function buildCertificatePdfBuffer({ certificate, inspector }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      lang: "he-IL",
      info: { Title: docTitle(certificate.docType), Author: inspector?.name || "" },
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

    const left = doc.page.margins.left;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.page.margins.top;

    const title = docTitle(certificate.docType);
    doc.fontSize(18).text(title, left, y, { width: w, align: "right" });
    y += 28;
    doc.fontSize(10).fillColor("#444").text("נערך בהתאם לתקנות החשמל", left, y, {
      width: w,
      align: "right",
    });
    y += 22;
    doc.fillColor("#000");

    const logoBuf = dataUrlToBuffer(inspector?.logoData);
    if (logoBuf) {
      try {
        doc.image(logoBuf, left + w - 120, y, { width: 120, height: 56, fit: [120, 56] });
        y += 64;
      } catch {
        y += 6;
      }
    }

    const when = fmtWhen(certificate.updatedAt || certificate.createdAt);
    const lines = [
      ["שם מתקן", certificate.facilityName || ""],
      ["כתובת", certificate.address || ""],
      ["גודל חיבור", certificate.connectionSize || ""],
      ["הארקה / שיטת הגנה", certificate.groundingValue || ""],
      ["בידוד", certificate.insulation || ""],
      ["תאריך", when],
      ["בודק", inspector?.name || ""],
      ["רישיון", inspector?.licenseNo || ""],
      ["טלפון", inspector?.phone || ""],
    ];

    doc.fontSize(11);
    for (const [label, val] of lines) {
      const block = `${label}: ${val}`;
      doc.text(block, left, y, { width: w, align: "right" });
      y += doc.heightOfString(block, { width: w, align: "right" }) + 4;
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
        doc.font("Hebrew").fontSize(11);
      }
    }

    y += 8;
    doc.fontSize(12).text("הערות:", left, y, { width: w, align: "right" });
    y += 16;
    doc.fontSize(10).text(certificate.notes || "—", left, y, {
      width: w,
      align: "right",
    });
    y += doc.heightOfString(certificate.notes || "—", { width: w, align: "right" }) + 12;

    const photos = Array.isArray(certificate.photos) ? certificate.photos : [];
    const thumbW = 110;
    const thumbH = 78;
    for (const p of photos) {
      const b = dataUrlToBuffer(p?.data);
      if (!b) continue;
      if (y + thumbH > doc.page.height - 100) {
        doc.addPage();
        y = doc.page.margins.top;
        doc.font("Hebrew");
      }
      try {
        doc.image(b, left + w - thumbW, y, { width: thumbW, height: thumbH, fit: [thumbW, thumbH] });
      } catch {
        /* skip bad image */
      }
      y += thumbH + 10;
    }
    y += 6;

    const sigBuf = dataUrlToBuffer(certificate.signatureData);
    const stampBuf = dataUrlToBuffer(inspector?.stampData);

    if (y > doc.page.height - 130) {
      doc.addPage();
      y = doc.page.margins.top;
      doc.font("Hebrew");
    }

    doc.fontSize(10).text("חתימה וחותמת", left, y, { width: w, align: "right" });
    y += 14;

    const rowY = y;
    if (stampBuf) {
      try {
        doc.image(stampBuf, left + w - 100, rowY, { width: 100, height: 72, fit: [100, 72] });
      } catch {
        /* ignore */
      }
    }
    if (sigBuf) {
      try {
        doc.image(sigBuf, left, rowY, { width: 140, height: 56, fit: [140, 56] });
      } catch {
        /* ignore */
      }
    }

    doc.end();
  });
}
