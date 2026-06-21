import {
  certTypeLabel,
} from "./cert-types.js";

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
    const checks = (ex.checks || [])
      .map((ch) => `<tr><td>${escapeHtml(ch.item || "")}</td><td>${escapeHtml(ch.result || "")}</td></tr>`)
      .join("");
    extraHtml = `
      <p><strong>בעלים:</strong> ${escapeHtml(ex.ownerName || c.facilityName || "")} · <strong>סוג אתר:</strong> ${escapeHtml(ex.siteKind || "")}</p>
      <p><strong>עמדה:</strong> ${escapeHtml(ex.stationManufacturer || "")} ${escapeHtml(ex.stationModel || "")} · ${escapeHtml(ex.stationPowerKw || "")} kW</p>
      <p><strong>מתקין:</strong> ${escapeHtml(ex.installerName || "")} · רישיון ${escapeHtml(ex.installerLicense || "")}</p>
      <div class="table-wrap" style="margin:0.75rem 0"><table class="table table-compact"><thead><tr><th>בדיקה</th><th>תוצאה</th></tr></thead><tbody>${checks}</tbody></table></div>
      <p class="share-banner">${escapeHtml(ex.gridApprovalBanner || "מאושר לחיבור לרשת לפני הפעלה ראשונה")}</p>`;
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
  return `
    <p><strong>סטטוס:</strong> ${escapeHtml(wf)}${ex.docNo ? ` · <strong>מס׳ מסמך:</strong> ${escapeHtml(ex.docNo)}` : ""}</p>
    <p><strong>תאריך בדיקה:</strong> ${escapeHtml(ex.inspectionDate || fmtDate(c.updatedAt))}</p>
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
