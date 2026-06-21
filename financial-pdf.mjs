import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import bidiFactory from "bidi-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = path.join(__dirname, "public", "fonts", "NotoSansHebrew-Regular.ttf");

const bidi = bidiFactory();

function v(s) {
  if (s == null || s === "") return "";
  const str = String(s).replace(/\r\n/g, "\n");
  const emb = bidi.getEmbeddingLevels(str);
  return bidi.getReorderedString(str, emb);
}

function money(n) {
  return Number(n || 0).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL");
  } catch {
    return String(iso);
  }
}

/**
 * @param {{ doc: object, inspector: object }} opts
 * @returns {Promise<Buffer>}
 */
export function buildFinancialPdfBuffer({ doc, inspector }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const isInvoice = doc.type === "invoice";
    const title = isInvoice ? "חשבונית" : "הצעת מחיר";
    const docPdf = new PDFDocument({
      size: "A4",
      margin: 48,
      lang: "he-IL",
      bufferPages: true,
      info: {
        Title: title,
        Author: inspector?.name || "",
        Subject: doc.docNo ? `מס׳ ${doc.docNo}` : title,
      },
    });
    docPdf.on("data", (c) => chunks.push(c));
    docPdf.on("end", () => resolve(Buffer.concat(chunks)));
    docPdf.on("error", reject);

    try {
      docPdf.registerFont("Hebrew", HEBREW_FONT);
    } catch (e) {
      reject(new Error(`Hebrew font missing: ${e.message}`));
      return;
    }
    docPdf.font("Hebrew");

    const pageW = docPdf.page.width;
    const m = docPdf.page.margins;
    const contentW = pageW - m.left - m.right;
    const left = m.left;
    let y = m.top;

    docPdf.save();
    docPdf.rect(left, y, contentW, 4).fill("#0f172a");
    docPdf.restore();
    y += 14;

    docPdf.fontSize(18).fillColor("#0f172a");
    docPdf.text(v(title), left, y, { width: contentW, align: "center" });
    y += 22;

    docPdf.fontSize(10).fillColor("#475569");
    const sub = [
      doc.docNo ? `מספר מסמך: ${doc.docNo}` : null,
      isInvoice && doc.allocationNo ? `הקצאה: ${doc.allocationNo}` : null,
      doc.issueDate ? `תאריך הנפקה: ${fmtDate(doc.issueDate)}` : null,
      doc.dueDate ? `תאריך יעד: ${fmtDate(doc.dueDate)}` : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    if (sub) {
      docPdf.text(v(sub), left, y, { width: contentW, align: "center" });
      y += 16;
    }

    docPdf.fontSize(11).fillColor("#0f172a");
    docPdf.text(v(inspector?.name || "—"), left, y, { width: contentW, align: "right" });
    y += 14;
    docPdf.fontSize(9.5).fillColor("#b45309");
    docPdf.text(
      v(`רישיון בודק: ${inspector?.licenseNo || "—"}`),
      left,
      y,
      { width: contentW, align: "right" }
    );
    y += 12;
    docPdf.fontSize(9).fillColor("#64748b");
    docPdf.text(
      v(`טלפון: ${inspector?.phone || "—"}`),
      left,
      y,
      { width: contentW, align: "right" }
    );
    y += 20;

    docPdf.fontSize(12).fillColor("#0f172a");
    docPdf.text(v("פרטי לקוח"), left, y, { width: contentW, align: "right" });
    y += 14;

    const custLines = [
      `שם: ${doc.customerName || "—"}`,
      doc.customerId ? `ח.פ / ת.ז: ${doc.customerId}` : null,
      doc.customerAddress ? `כתובת: ${doc.customerAddress}` : null,
    ].filter(Boolean);
    docPdf.fontSize(10).fillColor("#334155");
    for (const line of custLines) {
      docPdf.text(v(line), left, y, { width: contentW, align: "right" });
      y += 12;
    }
    y += 8;

    const items = Array.isArray(doc.items) ? doc.items : [];
    if (items.length > 0) {
      docPdf.fontSize(12).fillColor("#0f172a");
      docPdf.text(v("פירוט שורות"), left, y, { width: contentW, align: "right" });
      y += 14;
      docPdf.fontSize(9).fillColor("#334155");
      for (const it of items) {
        const desc = it.description ?? it.text ?? "";
        const amt = it.amount ?? it.total ?? "";
        docPdf.text(v(`${desc} — ₪${money(amt)}`), left, y, { width: contentW, align: "right" });
        y += 11;
        if (y > docPdf.page.height - 120) {
          docPdf.addPage();
          y = m.top;
          docPdf.font("Hebrew");
        }
      }
      y += 8;
    }

    docPdf.save();
    docPdf.roundedRect(left, y, contentW, 72, 2).fill("#f8fafc");
    docPdf.restore();
    let ty = y + 10;
    docPdf.fontSize(10).fillColor("#334155");
    docPdf.text(v(`סכום לפני מע״מ: ₪${money(doc.subtotal)}`), left + 12, ty, {
      width: contentW - 24,
      align: "right",
    });
    ty += 14;
    docPdf.text(
      v(`מע״מ (${Number(doc.taxRate || 0)}%): ₪${money(doc.taxAmount)}`),
      left + 12,
      ty,
      { width: contentW - 24, align: "right" }
    );
    ty += 16;
    docPdf.fontSize(12).fillColor("#0f172a");
    docPdf.text(v(`סה״כ לתשלום: ₪${money(doc.totalAmount)}`), left + 12, ty, {
      width: contentW - 24,
      align: "right",
    });
    y += 80;

    if (doc.status) {
      docPdf.fontSize(9).fillColor("#64748b");
      docPdf.text(v(`סטטוס: ${doc.status}`), left, y, { width: contentW, align: "right" });
      y += 12;
    }
    if (doc.notes) {
      docPdf.fontSize(10).fillColor("#334155");
      docPdf.text(v("הערות:"), left, y, { width: contentW, align: "right" });
      y += 12;
      docPdf.fontSize(9).fillColor("#475569");
      docPdf.text(v(String(doc.notes)), left, y, { width: contentW, align: "right" });
    }

    docPdf.end();
  });
}
