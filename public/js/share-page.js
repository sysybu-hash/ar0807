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
      const title =
        c.docType === "portable" ? "אישור צרכנים מטלטלים" : "אישור תקינות מתקן";
      titleEl.textContent = title;
      expiryEl.textContent = `תוקף הקישור עד: ${fmtDate(data.expiresAt)}`;
      fieldsEl.innerHTML = `
        <p><strong>שם מתקן:</strong> ${escapeHtml(c.facilityName)}</p>
        <p><strong>כתובת:</strong> ${escapeHtml(c.address || "")}</p>
        <p><strong>גודל חיבור:</strong> ${escapeHtml(c.connectionSize || "")}</p>
        <p><strong>הארקה:</strong> ${escapeHtml(c.groundingValue || "")}</p>
        <p><strong>בידוד:</strong> ${escapeHtml(c.insulation || "")}</p>
        <p><strong>בודק:</strong> ${escapeHtml(ins.name || "")} · רישיון ${escapeHtml(ins.licenseNo || "")}</p>
        <p style="margin-top:0.75rem; white-space: pre-wrap;"><strong>הערות:</strong> ${escapeHtml(c.notes || "")}</p>
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
