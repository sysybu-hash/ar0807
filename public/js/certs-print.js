/** הדפסת HTML לאישורי תקינות — תוכן מלא תואם PDF */

import { certTypeLabel, CERT_TYPES, normalizeDocType } from "./cert-types.js";
import { formatHebrewDateFull } from "./hebrew-date.js";
import { STR } from "./cert-strings.js";

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tableHtml(headers, rows, emptyColspan) {
  const head = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const body =
    rows.length > 0
      ? `<tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`
      : `<tbody><tr><td colspan="${emptyColspan}">—</td></tr></tbody>`;
  return `<table class="print-table">${head}${body}</table>`;
}

export function printDocTypeBody(doc) {
  const ex = doc.extra && typeof doc.extra === "object" ? doc.extra : {};
  const t = doc.docType || "installation";

  if (t === "portable") {
    const rows = (ex.appliances || []).map((a) => [
      a.assetId || "",
      a.description || "",
      a.location || "",
      a.visualOk || "",
      a.earthContinuity || "",
      a.insulation || "",
      a.leakage || "",
      a.result || "",
      a.nextTestDate || "",
    ]);
    return `
      <p><b>מזמין:</b> ${escapeHtml(ex.employerName || doc.facilityName || "")}</p>
      <p><b>שיטת סימון:</b> ${escapeHtml(ex.markingMethod || STR.defaultMarking)}</p>
      <h4 class="print-section">${STR.appliancesSection}</h4>
      ${tableHtml(
        [
          STR.colAsset,
          STR.colDescription,
          STR.colLocation,
          STR.colVisual,
          STR.colEarth,
          STR.colInsulation,
          STR.colLeakage,
          STR.colResult,
          STR.colNextTest,
        ],
        rows,
        9
      )}
      <p class="print-summary"><b>מסקנה:</b> ${escapeHtml(ex.summary || doc.notes || "")}</p>`;
  }

  if (t === "ev_charging") {
    const checkRows = (ex.checks || []).map((c) => [c.item || "", c.result || ""]);
    const periodicRows = (ex.periodicTests || []).map((p) => [
      p.test || "",
      p.frequency || "",
      p.lastDate || "",
      p.result || "",
    ]);
    return `
      <p><b>בעלים:</b> ${escapeHtml(ex.ownerName || doc.facilityName || "")} · <b>סוג אתר:</b> ${escapeHtml(ex.siteKind || "")}</p>
      <p><b>עמדה:</b> ${escapeHtml(ex.stationManufacturer || "")} ${escapeHtml(ex.stationModel || "")} · ${escapeHtml(ex.stationPowerKw || "")} kW · ${escapeHtml(ex.chargeType || "")}</p>
      <p><b>מחבר:</b> ${escapeHtml(ex.connectorType || "")} · <b>סידורי:</b> ${escapeHtml(ex.stationSerial || "")}</p>
      <p><b>הצהרת יבואן:</b> ${escapeHtml(ex.importerDeclarationRef || "")}${ex.importerDeclarationDate ? ` (${escapeHtml(ex.importerDeclarationDate)})` : ""}</p>
      <p><b>מתקין:</b> ${escapeHtml(ex.installerName || "")} · רישיון ${escapeHtml(ex.installerLicense || "")}</p>
      <p><b>הארקה / הגנה:</b> ${escapeHtml(doc.groundingValue || "")}</p>
      <h4 class="print-section">${STR.evChecksSection}</h4>
      ${tableHtml([STR.colItem, STR.colResult], checkRows, 2)}
      <h4 class="print-section">${STR.evPeriodicSection}</h4>
      ${tableHtml([STR.colCheck, STR.colFrequency, STR.colLastDate, STR.colResult], periodicRows, 4)}
      <p class="print-banner">${escapeHtml(ex.gridApprovalBanner || STR.defaultGridBanner)}</p>`;
  }

  const techRows = (ex.techInspection || []).map((r) => [r.description || "", r.result || "—"]);
  const visualRows = (ex.visualChecklist || []).map((s) => [typeof s === "string" ? s : String(s)]);
  return `
    <p><b>לקוח:</b> ${escapeHtml(ex.clientName || "")} · <b>מטרת בדיקה:</b> ${escapeHtml(ex.inspectionPurpose || "")}</p>
    <p><b>סוג מתקן:</b> ${escapeHtml(ex.installationType || "")}</p>
    <p><b>גודל חיבור קיים:</b> ${escapeHtml(doc.connectionSize || ex.connectionExisting || "")} · <b>מבוקש:</b> ${escapeHtml(ex.connectionRequested || "")}</p>
    <p><b>מספר לוח / מונה:</b> ${escapeHtml(ex.panelMeterNo || "")}</p>
    <p><b>הארקה:</b> ${escapeHtml(doc.groundingValue || "")} · <b>בידוד:</b> ${escapeHtml(doc.insulation || "")}</p>
    <h4 class="print-section">${STR.techSection}</h4>
    ${tableHtml([STR.colTechDesc, STR.colResult], techRows, 2)}
    <h4 class="print-section">${STR.visualSection}</h4>
    ${tableHtml([STR.colItem], visualRows, 1)}
    <p class="print-banner">${escapeHtml(ex.finalStatusBanner || STR.defaultFinalBanner)}</p>`;
}

export function buildSignatureFooterHtml(settings, doc) {
  const sx = Number(settings.stampOffsetXmm || 0);
  const sy = Number(settings.stampOffsetYmm || 0);
  const decl = String(settings.inspectorDeclarationText || "").trim();
  const declHtml = decl ? `<div class="sig-decl-text">${escapeHtml(decl)}</div>` : "";
  let stampInner = `<div class="sig-stamp-empty"></div>`;
  if (settings.stampData) {
    stampInner = `<img src="${settings.stampData}" alt="" class="sig-stamp-img" style="transform:translate(${sx}mm,${sy}mm)" />`;
  } else if (doc.signatureData) {
    stampInner = `<img src="${doc.signatureData}" alt="" class="sig-stamp-img" />`;
  }
  return `
    <div class="sig-footer">
      <div class="sig-footer-col sig-footer-decl">
        <div class="sig-footer-title">הצהרת החשמלאי</div>
        ${declHtml}
      </div>
      <div class="sig-footer-col sig-footer-stamp">
        <div class="sig-footer-title">חתימה וחותמת החשמלאי</div>
        <div class="sig-line"></div>
        ${stampInner}
      </div>
    </div>`;
}

export function buildPrintDocHtml(doc, settings, { autoPrint = false, fmtDate } = {}) {
  const when = fmtDate(doc.updatedAt || doc.createdAt || new Date().toISOString());
  const title = certTypeLabel(doc.docType);
  const ex = doc.extra && typeof doc.extra === "object" ? doc.extra : {};
  const docNoStr = ex.docNo ? String(ex.docNo) : "";
  const approvalNo = docNoStr || (doc.id != null ? String(doc.id) : "");
  const issueDateFmt = (() => {
    const v = ex.issueDate;
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) {
      try {
        return new Date(`${String(v).trim()}T12:00:00`).toLocaleDateString("he-IL");
      } catch {
        return String(v).trim();
      }
    }
    try {
      return new Date(doc.updatedAt || doc.createdAt || Date.now()).toLocaleDateString("he-IL");
    } catch {
      return "";
    }
  })();
  const issueDateHebrew = formatHebrewDateFull(ex.issueDate, doc.updatedAt || doc.createdAt);
  const pdfTitle = CERT_TYPES[normalizeDocType(doc.docType)]?.pdfTitle || title;
  const wfStr =
    ex.workflowStatus === "final"
      ? STR.statusFinal
      : ex.workflowStatus === "draft"
        ? STR.statusDraft
        : "";
  const typeBody = printDocTypeBody(doc);
  const photosHtml = (doc.photos || [])
    .map(
      (p) =>
        `<div class="rounded-lg overflow-hidden border border-slate-200 shadow-sm"><img src="${p.data}" class="w-full h-44 md:h-52 object-cover" alt="" /></div>`
    )
    .join("");
  const photosBlock = photosHtml
    ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">${photosHtml}</div>`
    : "";
  const signatureFooter = buildSignatureFooterHtml(settings, doc);
  const standardLayout = `<div class="max-w-[210mm] mx-auto p-8 text-right">
    <div class="flex flex-row-reverse justify-between items-start border-b-4 border-blue-800 pb-4 mb-6 gap-4">
      <div class="flex flex-row-reverse items-start gap-4">
        ${settings.logoData ? `<img src="${settings.logoData}" style="max-height:70px" alt="">` : ""}
        <div><h1 class="text-2xl font-bold text-blue-900">${escapeHtml(title)}</h1><p class="text-sm text-slate-600">נערך בהתאם לתקנות החשמל והתקן IEC</p>
        ${docNoStr || wfStr ? `<p class="text-xs text-slate-500 mt-1">${docNoStr ? `${STR.printDocNo}: ${escapeHtml(docNoStr)}` : ""}${docNoStr && wfStr ? " · " : ""}${wfStr ? `${STR.printStatus}: ${escapeHtml(wfStr)}` : ""}</p>` : ""}
        ${issueDateFmt || issueDateHebrew ? `<p class="text-xs text-slate-500 mt-1">${issueDateFmt ? `תאריך הנפקה: ${escapeHtml(issueDateFmt)}` : ""}${issueDateFmt && issueDateHebrew ? "<br>" : ""}${issueDateHebrew ? `תאריך עברי: ${escapeHtml(issueDateHebrew)}` : ""}</p>` : ""}
        </div>
      </div>
      <div class="text-sm shrink-0">
        <div class="font-bold">${escapeHtml(settings.name)}</div>
        <div>רישיון: ${escapeHtml(settings.licenseNo || "—")}</div>
        <div>טלפון: ${escapeHtml(settings.phone || "—")}</div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 text-sm border rounded p-3 bg-slate-50 mb-4">
      <div><b>${STR.printFacility}:</b> ${escapeHtml(doc.facilityName)}</div>
      <div><b>${STR.printDate}:</b> ${escapeHtml(when)}</div>
      <div><b>${STR.printAddress}:</b> ${escapeHtml(doc.address || "")}</div>
      <div><b>${STR.printInspectionDate}:</b> ${escapeHtml(ex.inspectionDate || "")}</div>
    </div>
    <div class="mb-4 print-type-body">${typeBody}</div>
    <div class="mb-4"><h3 class="font-bold">${STR.printNotes}</h3><div class="border rounded p-2 min-h-[40px] whitespace-pre-wrap">${escapeHtml(doc.notes || "")}</div></div>
    ${photosBlock}
    ${signatureFooter}
  </div>`;
  const blankScale = Math.min(1.2, Math.max(0.8, Number(settings.blankScale || 1)));
  const blankLayout = `
    <div class="blank-sheet">
      ${settings.blankTemplateData ? `<img src="${settings.blankTemplateData}" class="blank-bg" alt="">` : ""}
      <div class="blank-meta-top" aria-hidden="true">
        <span class="blank-meta-bsd">בס"ד</span>
      </div>
      <div class="blank-content">
        <div class="blank-doc-issue">
          ${issueDateFmt ? `<div>תאריך הנפקה: ${escapeHtml(issueDateFmt)}</div>` : ""}
          ${issueDateHebrew ? `<div>תאריך עברי: ${escapeHtml(issueDateHebrew)}</div>` : ""}
        </div>
        <h1 class="blank-doc-title">${escapeHtml(pdfTitle)}</h1>
        <div class="blank-doc-approval">${approvalNo ? `מס' אישור: ${escapeHtml(approvalNo)}` : ""}</div>
        <div class="grid grid-cols-2 gap-2 text-sm border rounded p-3 bg-white/90 mb-4">
          <div><b>${STR.printDocType}:</b> ${escapeHtml(title)}</div>
          <div><b>${STR.printDate}:</b> ${escapeHtml(when)}</div>
          <div><b>${STR.printFacility}:</b> ${escapeHtml(doc.facilityName)}</div>
          <div><b>${STR.printAddress}:</b> ${escapeHtml(doc.address || "")}</div>
          <div><b>${STR.printInspectionDate}:</b> ${escapeHtml(ex.inspectionDate || "")}</div>
          <div><b>${STR.printInspector}:</b> ${escapeHtml(settings.name || "")}</div>
        </div>
        <div class="mb-4 print-type-body bg-white/90">${typeBody}</div>
        <div class="mb-4 bg-white/90 border rounded p-2 min-h-[40px] whitespace-pre-wrap"><b>${STR.printNotes}:</b> ${escapeHtml(doc.notes || "")}</div>
        ${photosBlock}
        ${signatureFooter}
      </div>
    </div>`;
  const printScript = autoPrint ? `<script>window.onload=()=>{window.print()};<\/script>` : "";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/tw-built.css" />
  <style>
    .blank-sheet{position:relative;max-width:210mm;min-height:287mm;margin:0 auto;padding:12mm}
    .blank-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0;transform:translate(${Number(settings.blankOffsetXmm || 0)}mm, ${Number(settings.blankOffsetYmm || 0)}mm) scale(${blankScale});transform-origin:top right}
    .blank-meta-top{position:absolute;top:11mm;left:14mm;right:14mm;z-index:2;display:flex;justify-content:flex-end;font-size:0.8rem;color:#475569;line-height:1.2}
    .blank-meta-bsd{text-align:right}
    .blank-doc-issue{text-align:left;font-size:1rem;color:#475569;margin-bottom:0.35rem}
    .blank-doc-title{text-align:center;font-size:1.2rem;font-weight:700;color:#0d3d82;margin:0 0 0.4rem;line-height:1.35}
    .blank-doc-approval{text-align:center;font-size:1.05rem;font-weight:700;color:#334155;margin-bottom:0.55rem}
    .blank-content{position:relative;z-index:1;padding-top:53mm;padding-left:14mm;padding-right:14mm;padding-bottom:28mm}
    .print-table{width:100%;border-collapse:collapse;margin:0.75rem 0;font-size:0.85rem}
    .print-table th,.print-table td{border:1px solid #cbd5e1;padding:0.35rem 0.5rem;text-align:right}
    .print-table th{background:#eef1f6}
    .print-banner{background:#1a56b4;color:#fff;padding:0.5rem 1rem;text-align:center;border-radius:0.25rem;font-weight:700;margin:0.75rem 0}
    .print-type-body{font-size:0.9rem;line-height:1.6}
    .print-section{margin:0.75rem 0 0.25rem;font-weight:700;font-size:0.95rem}
    .sig-footer{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:2rem;align-items:start}
    .sig-footer-title{font-size:0.82rem;font-weight:700;color:#0d3d82;margin-bottom:0.35rem}
    .sig-decl-text{font-size:0.78rem;color:#334155;line-height:1.55;white-space:pre-wrap}
    .sig-line{border-top:1px solid #94a3b8;margin:0.35rem 0 0.5rem}
    .sig-stamp-img{display:block;max-width:188px;max-height:64px;margin:0 auto;transform-origin:top center}
    .sig-stamp-empty{min-height:64px}
  </style>
  </head><body>
  ${settings.useBlankTemplate && settings.blankTemplateData ? blankLayout : standardLayout}
  ${printScript}</body></html>`;
}
