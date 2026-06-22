import {
  certTypeLabel,
  filterEvChecksForOutput,
  filterEvPeriodicTestsForOutput,
} from "./cert-types.js";
import { formatHebrewDateFull } from "./hebrew-date.js";
import { STR } from "./cert-strings.js";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function tokenFromPath() {
  const m = /^\/share\/([^/?#]+)/.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]) : "";
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("he-IL");
  } catch {
    return iso;
  }
}

function fmtIssueDate(ex, c) {
  const v = ex.issueDate;
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) {
    try {
      return new Date(`${String(v).trim()}T12:00:00`).toLocaleDateString("he-IL");
    } catch {
      return String(v).trim();
    }
  }
  try {
    return new Date(c.updatedAt || c.createdAt || Date.now()).toLocaleDateString("he-IL");
  } catch {
    return "";
  }
}

function shareTable(headers, rows, emptyColspan) {
  const head = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const body =
    rows.length > 0
      ? `<tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`
      : `<tbody><tr><td colspan="${emptyColspan}">—</td></tr></tbody>`;
  return `<div class="table-wrap" style="margin:0.75rem 0"><table class="table table-compact">${head}${body}</table></div>`;
}

function renderShareBody(c) {
  const ex = c.extra && typeof c.extra === "object" ? c.extra : {};
  const t = c.docType || "installation";
  let extraHtml = "";
  if (t === "portable") {
    const rows = (ex.appliances || [])
      .map(
        (a) =>
          `<tr><td>${escapeHtml(a.assetId || "")}</td><td>${escapeHtml(a.description || "")}</td><td>${escapeHtml(a.location || "")}</td><td>${escapeHtml(a.result || "")}</td></tr>`
      )
      .join("");
    extraHtml = `
      <p><strong>מזמין:</strong> ${escapeHtml(ex.employerName || c.facilityName || "")}</p>
      <div class="table-wrap" style="margin:0.75rem 0"><table class="table table-compact"><thead><tr><th>נכס</th><th>תיאור</th><th>מיקום</th><th>תוצאה</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>—</td></tr>"}</tbody></table></div>
      <p><strong>מסקנה:</strong> ${escapeHtml(ex.summary || c.notes || "")}</p>`;
  } else if (t === "ev_charging") {
    const checkRows = filterEvChecksForOutput(ex.checks || []).map((ch) => [ch.item || "", ch.result || ""]);
    const periodicRows = filterEvPeriodicTestsForOutput(ex.periodicTests || []).map((p) => [
      p.test || "",
      p.frequency || "",
      p.lastDate || "",
      p.result || "",
    ]);
    const importerLine = `${ex.importerDeclarationRef || "—"}${ex.importerDeclarationDate ? ` (${ex.importerDeclarationDate})` : ""}`;
    extraHtml = `
      <p><strong>בעלים:</strong> ${escapeHtml(ex.ownerName || c.facilityName || "")} · <strong>סוג אתר:</strong> ${escapeHtml(ex.siteKind || "")}</p>
      <p><strong>עמדה:</strong> ${escapeHtml(ex.stationManufacturer || "")} ${escapeHtml(ex.stationModel || "")} · ${escapeHtml(ex.stationPowerKw || "")} kW · ${escapeHtml(ex.chargeType || "")}</p>
      <p><strong>מחבר:</strong> ${escapeHtml(ex.connectorType || "")} · <strong>סידורי:</strong> ${escapeHtml(ex.stationSerial || "")}</p>
      <p><strong>יבואן/יצרן:</strong> ${escapeHtml(importerLine)}</p>
      <p><strong>הארקה / הגנה:</strong> ${escapeHtml(c.groundingValue || ex.groundingValue || "")}</p>
      <p><strong>תקן:</strong> ${escapeHtml(ex.iec61851Ref || "IEC 61851-1 / IEC 60364-7-722")}</p>
      <h4 style="margin:0.75rem 0 0.35rem;font-size:1rem;color:var(--text-mid);">${escapeHtml(STR.evChecksSection)}</h4>
      ${shareTable([STR.colItem, STR.colResult], checkRows, 2)}
      <h4 style="margin:0.75rem 0 0.35rem;font-size:1rem;color:var(--text-mid);">${escapeHtml(STR.evPeriodicSection)}</h4>
      ${shareTable([STR.colCheck, STR.colFrequency, STR.colLastDate, STR.colResult], periodicRows, 4)}
      <p class="share-banner">${escapeHtml(ex.gridApprovalBanner || STR.defaultGridBanner)}</p>`;
  } else {
    extraHtml = `
      <p><strong>לקוח:</strong> ${escapeHtml(ex.clientName || "")}</p>
      <p><strong>מטרת בדיקה:</strong> ${escapeHtml(ex.inspectionPurpose || "")}</p>
      <p><strong>סוג מתקן:</strong> ${escapeHtml(ex.installationType || "")}</p>
      <p><strong>גודל חיבור:</strong> ${escapeHtml(c.connectionSize || "")}</p>
      <p><strong>הארקה:</strong> ${escapeHtml(c.groundingValue || "")}</p>
      <p><strong>בידוד:</strong> ${escapeHtml(c.insulation || "")}</p>`;
  }
  const wf = ex.workflowStatus === "final" ? "סופי" : "טיוטה";
  const photoCount = Array.isArray(c.photos) ? c.photos.filter((p) => p?.data).length : 0;
  const issueDateFmt = fmtIssueDate(ex, c);
  const issueDateHebrew = formatHebrewDateFull(ex.issueDate, c.updatedAt || c.createdAt);
  const issueDateBlock =
    issueDateFmt || issueDateHebrew
      ? `<p><strong>תאריך הנפקה:</strong> ${escapeHtml(issueDateFmt)}${issueDateFmt && issueDateHebrew ? "<br>" : ""}${issueDateHebrew ? escapeHtml(issueDateHebrew) : ""}</p>`
      : "";
  return `
    <p><strong>סטטוס:</strong> ${escapeHtml(wf)}${ex.docNo ? ` · <strong>מס׳ אישור:</strong> ${escapeHtml(ex.docNo)}` : ""}</p>
    ${issueDateBlock}
    <p><strong>תאריך בדיקה:</strong> ${escapeHtml(ex.inspectionDate || fmtDate(c.updatedAt))}</p>
    ${photoCount > 0 ? `<p><strong>תמונות מהשטח:</strong> צורפו ${photoCount} תמונות — זמינות בקובץ ה-PDF.</p>` : ""}
    ${extraHtml}
    <p style="margin-top:0.75rem; white-space: pre-wrap;"><strong>הערות:</strong> ${escapeHtml(c.notes || "")}</p>`;
}

const statusEl = document.getElementById("shareStatus");
const contentEl = document.getElementById("shareContent");
const titleEl = document.getElementById("shareTitle");
const expiryEl = document.getElementById("shareExpiry");
const fieldsEl = document.getElementById("shareFields");
const pdfLink = document.getElementById("sharePdfLink");

const token = tokenFromPath();
if (!token) {
  statusEl.textContent = "קישור לא תקין.";
  statusEl.className = "msg msg-err";
} else {
  fetch(`/api/share/${encodeURIComponent(token)}`)
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        statusEl.textContent = data?.error || "לא ניתן לטעון את המסמך.";
        statusEl.className = "msg msg-err";
        return;
      }
      const c = data.certificate;
      const ins = data.inspector || {};
      titleEl.textContent = certTypeLabel(c.docType);
      expiryEl.textContent = `תוקף הקישור עד: ${fmtDate(data.expiresAt)}`;
      fieldsEl.innerHTML = `
        <div style="padding:0.75rem 1rem;margin-bottom:0.75rem;border-radius:var(--radius-md);background:rgba(180,83,9,0.12);border:1px solid rgba(251,191,36,0.35);">
          <strong style="display:block;margin-bottom:0.35rem;">בודק מוסמך</strong>
          <span style="font-weight:700">${escapeHtml(ins.name || "—")}</span>
          <div style="margin-top:0.35rem;font-size:1.05rem;font-weight:800;color:#b45309;">רישיון ${escapeHtml(ins.licenseNo || "—")}</div>
          ${ins.phone ? `<div style="margin-top:0.35rem;font-size:0.95rem;">טלפון: ${escapeHtml(ins.phone)}</div>` : ""}
        </div>
        <p><strong>שם מתקן:</strong> ${escapeHtml(c.facilityName)}</p>
        <p><strong>כתובת:</strong> ${escapeHtml(c.address || "")}</p>
        ${renderShareBody(c)}
      `;
      pdfLink.href = `/api/share/${encodeURIComponent(token)}/pdf`;
      statusEl.classList.add("hidden");
      contentEl.classList.remove("hidden");
    })
    .catch(() => {
      statusEl.textContent = "שגיאת רשת — נסה שוב מאוחר יותר.";
      statusEl.className = "msg msg-err";
    });
}
