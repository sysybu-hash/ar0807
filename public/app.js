/* global SignaturePad */
const API = "";

let settings = {
  name: "אברהם רובינשטיין - חשמלאי מוסמך",
  licenseNo: "",
  phone: "",
  email: "",
  whatsapp: "+972587600807",
  aboutText:
    "אברהם רובינשטיין - חשמלאי מוסמך.\nמתמחה בבדיקות תקינות, תיעוד פרויקטים וניהול מלא של מסמכים פיננסיים ומקצועיים.",
  logoData: null,
  stampData: null,
  accessCode: "1234",
};

let isPortalOpen = false;
let projectPhotos = [];
let docPhotos = [];
let docSignaturePad = null;
let projectCache = [];
let docsCache = [];
let invoicesCache = [];
let quotesCache = [];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function showMsg(id, text, ok = true) {
  const n = $(id);
  if (!n) return;
  n.textContent = text || "";
  n.className = "msg " + (ok ? "text-emerald-700" : "text-red-600");
}

async function api(path, opts) {
  const r = await fetch(API + path, {
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
    body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!r.ok) throw new Error(data?.error || r.statusText);
  return data;
}

function normalizeWhatsapp(raw) {
  const x = String(raw || "").replace(/[^\d+]/g, "");
  if (x.startsWith("+")) return x;
  if (x.startsWith("0")) return `+972${x.slice(1)}`;
  return x ? `+${x}` : "";
}

function toWaHref(phone) {
  const n = normalizeWhatsapp(phone).replace("+", "");
  return `https://wa.me/${n}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("he-IL");
  } catch {
    return iso;
  }
}

function asMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function setSection(section) {
  ["home", "about", "contact", "portal"].forEach((s) =>
    $(`section-${s}`).classList.toggle("hidden", s !== section)
  );
}

function setupDrawer() {
  $("drawerOpen").onclick = () => $("drawer").classList.remove("hidden");
  $("drawerClose").onclick = () => $("drawer").classList.add("hidden");
  document.querySelectorAll(".drawer-link").forEach((btn) => {
    btn.onclick = () => {
      setSection(btn.dataset.section);
      $("drawer").classList.add("hidden");
    };
  });
  document.querySelector("[data-go-portal]").onclick = () => setSection("portal");
}

function renderHomeFromSettings() {
  $("heroInspectorName").textContent = settings.name || "אברהם רובינשטיין - חשמלאי מוסמך";
  $("contactName").textContent = settings.name || "—";
  $("contactPhone").textContent = settings.phone || "—";
  $("contactEmail").textContent = settings.email || "—";
  $("aboutText").textContent = settings.aboutText || "";

  const href = toWaHref(settings.whatsapp || settings.phone);
  $("whatsappLink").href = href;
  $("whatsappTopLink").href = href;
}

function setupPortalTabs() {
  document.querySelectorAll(".portal-tab").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".portal-tab").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      const name = btn.dataset.portalTab;
      document.querySelectorAll(".portal-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `portal-${name}`);
      });
    };
  });
}

function ensurePortalOpen() {
  $("portalGate").classList.add("hidden");
  $("portalArea").classList.remove("hidden");
  isPortalOpen = true;
}

function logoutPortal() {
  isPortalOpen = false;
  $("portalGate").classList.remove("hidden");
  $("portalArea").classList.add("hidden");
  $("accessCodeInput").value = "";
}

function setupPortalAuth() {
  $("accessLoginBtn").onclick = () => {
    const userCode = $("accessCodeInput").value.trim();
    const expected = String(settings.accessCode || "1234").trim();
    if (!expected || userCode === expected) {
      showMsg("accessMsg", "כניסה בוצעה בהצלחה.", true);
      ensurePortalOpen();
      refreshPortalData();
    } else {
      showMsg("accessMsg", "קוד שגוי.", false);
    }
  };
  $("logoutBtn").onclick = logoutPortal;
}

function renderThumbGrid(containerId, list, onDelete) {
  const box = $(containerId);
  box.innerHTML = "";
  list.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "thumb";
    d.innerHTML = `<img src="${p.data}" alt=""><button type="button">×</button>`;
    d.querySelector("button").onclick = () => onDelete(i);
    box.appendChild(d);
  });
}

function renderProjectPhotos() {
  renderThumbGrid("projectPhotoPreview", projectPhotos, (i) => {
    projectPhotos.splice(i, 1);
    renderProjectPhotos();
  });
}

function bindProjectForm() {
  $("projectPhotosInput").addEventListener("change", async (e) => {
    for (const f of Array.from(e.target.files || [])) {
      if (!f.type.startsWith("image/")) continue;
      projectPhotos.push({ name: f.name, data: await readImageFile(f) });
    }
    e.target.value = "";
    renderProjectPhotos();
  });

  $("newProjectBtn").onclick = () => fillProjectForm(null);
  $("saveProjectBtn").onclick = saveProject;
}

function fillProjectForm(project) {
  $("projectId").value = project ? String(project.id) : "";
  $("projectTitle").value = project?.title || "";
  $("projectClient").value = project?.clientName || "";
  $("projectAddress").value = project?.address || "";
  $("projectStatus").value = project?.status || "planned";
  $("projectStarted").value = project?.startedOn || "";
  $("projectCompleted").value = project?.completedOn || "";
  $("projectDescription").value = project?.description || "";
  projectPhotos = project?.photos ? project.photos.slice() : [];
  renderProjectPhotos();
}

async function saveProject() {
  const payload = {
    title: $("projectTitle").value.trim(),
    clientName: $("projectClient").value.trim(),
    address: $("projectAddress").value.trim(),
    status: $("projectStatus").value,
    startedOn: $("projectStarted").value,
    completedOn: $("projectCompleted").value,
    description: $("projectDescription").value.trim(),
    photos: projectPhotos,
  };
  if (!payload.title) return alert("יש להזין שם פרויקט.");
  const id = $("projectId").value.trim();
  if (id) await api(`/api/projects/${id}`, { method: "PUT", body: payload });
  else await api("/api/projects", { method: "POST", body: payload });
  fillProjectForm(null);
  await loadProjects();
}

async function loadProjects() {
  projectCache = await api("/api/projects");
  const tbody = $("projectsTable");
  tbody.innerHTML = "";
  projectCache.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.clientName || "")}</td>
      <td>${escapeHtml(row.status || "")}</td>
      <td>${escapeHtml(fmtDate(row.updatedAt))}</td>
      <td>
        <button type="button" class="text-blue-600 ml-2 edit">עריכה</button>
        <button type="button" class="text-red-600 del">מחיקה</button>
      </td>`;
    tr.querySelector(".edit").onclick = () => fillProjectForm(row);
    tr.querySelector(".del").onclick = async () => {
      if (!confirm("למחוק פרויקט?")) return;
      await api(`/api/projects/${row.id}`, { method: "DELETE" });
      await loadProjects();
    };
    tbody.appendChild(tr);
  });
}

function initDocSignature() {
  const canvas = $("docSignaturePad");
  docSignaturePad = new SignaturePad(canvas, { minWidth: 0.6, maxWidth: 2.2, penColor: "#0f172a" });
  const resize = () => {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = canvas.parentElement.clientWidth;
    canvas.width = w * ratio;
    canvas.height = 160 * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    docSignaturePad.clear();
  };
  resize();
  window.addEventListener("resize", resize);
  $("docClearSig").onclick = () => docSignaturePad.clear();
}

async function bindDocForm() {
  $("docPhotosInput").addEventListener("change", async (e) => {
    for (const f of Array.from(e.target.files || [])) {
      if (!f.type.startsWith("image/")) continue;
      docPhotos.push({ name: f.name, data: await readImageFile(f) });
    }
    e.target.value = "";
    renderDocPhotos();
  });
  $("newDocBtn").onclick = () => fillDocForm(null);
  $("saveDocBtn").onclick = saveDoc;
  $("printDocBtn").onclick = printCurrentDoc;
}

function renderDocPhotos() {
  renderThumbGrid("docPhotosPreview", docPhotos, (i) => {
    docPhotos.splice(i, 1);
    renderDocPhotos();
  });
}

function fillDocForm(doc) {
  $("docId").value = doc ? String(doc.id) : "";
  $("docType").value = doc?.docType || "installation";
  $("docFacilityName").value = doc?.facilityName || "";
  $("docAddress").value = doc?.address || "";
  $("docConnection").value = doc?.connectionSize || "";
  $("docGrounding").value = doc?.groundingValue || "";
  $("docInsulation").value = doc?.insulation || "";
  $("docNotes").value = doc?.notes || "";
  docPhotos = doc?.photos ? doc.photos.slice() : [];
  renderDocPhotos();
  docSignaturePad.clear();
  if (doc?.signatureData) docSignaturePad.fromDataURL(doc.signatureData);
}

function buildDocPayload() {
  return {
    docType: $("docType").value,
    facilityName: $("docFacilityName").value.trim(),
    address: $("docAddress").value.trim(),
    connectionSize: $("docConnection").value.trim(),
    groundingValue: $("docGrounding").value.trim(),
    insulation: $("docInsulation").value.trim(),
    notes: $("docNotes").value.trim(),
    photos: docPhotos,
    extra: {},
    signatureData: docSignaturePad.isEmpty() ? null : docSignaturePad.toDataURL("image/png"),
  };
}

async function saveDoc() {
  const payload = buildDocPayload();
  if (!payload.facilityName) return alert("שם מתקן הוא שדה חובה.");
  const id = $("docId").value.trim();
  if (id) await api(`/api/certificates/${id}`, { method: "PUT", body: payload });
  else {
    const created = await api("/api/certificates", { method: "POST", body: payload });
    $("docId").value = String(created.id);
  }
  await loadDocs();
  refreshDashboardStats();
}

function printDoc(doc) {
  const when = fmtDate(doc.updatedAt || doc.createdAt || new Date().toISOString());
  const title = doc.docType === "portable" ? "אישור צרכנים מטלטלים" : "אישור תקינות מתקן";
  const photosHtml = (doc.photos || []).map((p) => `<img src="${p.data}" style="width:140px;height:100px;object-fit:cover;border:1px solid #ddd;border-radius:6px">`).join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"><\/script></head><body>
  <div class="max-w-[210mm] mx-auto p-8">
    <div class="flex justify-between items-start border-b-4 border-blue-700 pb-4 mb-6">
      <div class="flex items-start gap-4">
        ${settings.logoData ? `<img src="${settings.logoData}" style="max-height:70px">` : ""}
        <div><h1 class="text-2xl font-bold text-blue-900">${title}</h1><p class="text-sm text-slate-600">נערך בהתאם לתקנות החשמל</p></div>
      </div>
      <div class="text-sm text-left">
        <div class="font-bold">${escapeHtml(settings.name)}</div>
        <div>רישיון: ${escapeHtml(settings.licenseNo || "—")}</div>
        <div>טלפון: ${escapeHtml(settings.phone || "—")}</div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 text-sm border rounded p-3 bg-slate-50 mb-4">
      <div><b>שם מתקן:</b> ${escapeHtml(doc.facilityName)}</div>
      <div><b>תאריך:</b> ${escapeHtml(when)}</div>
      <div><b>כתובת:</b> ${escapeHtml(doc.address || "")}</div>
      <div><b>גודל חיבור:</b> ${escapeHtml(doc.connectionSize || "")}</div>
      <div><b>הארקה:</b> ${escapeHtml(doc.groundingValue || "")}</div>
      <div><b>בידוד:</b> ${escapeHtml(doc.insulation || "")}</div>
    </div>
    <div class="mb-4"><h3 class="font-bold">הערות</h3><div class="border rounded p-2 min-h-[40px] whitespace-pre-wrap">${escapeHtml(doc.notes || "")}</div></div>
    ${photosHtml ? `<div class="mb-4 flex gap-2 flex-wrap">${photosHtml}</div>` : ""}
    <div class="flex justify-between items-end mt-8">
      <div>${settings.stampData ? `<img src="${settings.stampData}" style="max-width:110px;max-height:90px">` : ""}</div>
      <div class="text-center">
        ${doc.signatureData ? `<img src="${doc.signatureData}" style="height:80px">` : `<div style="height:80px"></div>`}
        <div class="border-t pt-1 text-sm">חתימה וחותמת</div>
      </div>
    </div>
  </div>
  <script>window.onload=()=>{window.print()};<\/script></body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
}

async function printCurrentDoc() {
  const id = $("docId").value.trim();
  if (id) {
    const doc = await api(`/api/certificates/${id}`);
    printDoc(doc);
  } else {
    printDoc({ ...buildDocPayload(), createdAt: new Date().toISOString() });
  }
}

async function loadDocs() {
  docsCache = await api("/api/certificates");
  const tbody = $("docsTable");
  tbody.innerHTML = "";
  docsCache.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.docType === "portable" ? "צרכנים מטלטלים" : "תקינות מתקן"}</td>
      <td>${escapeHtml(row.facilityName)}</td>
      <td>${escapeHtml(row.address || "")}</td>
      <td>${escapeHtml(fmtDate(row.updatedAt))}</td>
      <td>
        <button type="button" class="text-blue-600 ml-2 edit">עריכה</button>
        <button type="button" class="text-emerald-600 ml-2 print">הדפסה</button>
        <button type="button" class="text-red-600 del">מחיקה</button>
      </td>`;
    tr.querySelector(".edit").onclick = async () => fillDocForm(await api(`/api/certificates/${row.id}`));
    tr.querySelector(".print").onclick = async () => printDoc(await api(`/api/certificates/${row.id}`));
    tr.querySelector(".del").onclick = async () => {
      if (!confirm("למחוק מסמך?")) return;
      await api(`/api/certificates/${row.id}`, { method: "DELETE" });
      await loadDocs();
      refreshDashboardStats();
    };
    tbody.appendChild(tr);
  });
}

function renderFinancialForm(type) {
  const wrap = type === "invoice" ? $("invoiceFormWrap") : $("quoteFormWrap");
  const prefix = type === "invoice" ? "inv" : "quo";
  const allocationField = type === "invoice" ? `<div><label class="lbl">מספר הקצאה (רשות המיסים)</label><input id="${prefix}Allocation" class="inp"></div>` : "";
  wrap.innerHTML = `
    <form id="${prefix}Form" class="grid md:grid-cols-2 gap-3">
      <input type="hidden" id="${prefix}Id">
      <div><label class="lbl">מספר מסמך</label><input id="${prefix}No" class="inp"></div>
      ${allocationField}
      <div><label class="lbl">תאריך הנפקה</label><input id="${prefix}IssueDate" type="date" class="inp"></div>
      <div><label class="lbl">תאריך יעד</label><input id="${prefix}DueDate" type="date" class="inp"></div>
      <div><label class="lbl">שם לקוח *</label><input id="${prefix}CustomerName" class="inp"></div>
      <div><label class="lbl">ח.פ/ת.ז</label><input id="${prefix}CustomerId" class="inp"></div>
      <div class="md:col-span-2"><label class="lbl">כתובת לקוח</label><input id="${prefix}CustomerAddress" class="inp"></div>
      <div><label class="lbl">סכום לפני מע"מ</label><input id="${prefix}Subtotal" type="number" step="0.01" class="inp"></div>
      <div><label class="lbl">שיעור מע"מ %</label><input id="${prefix}TaxRate" type="number" step="0.01" value="18" class="inp"></div>
      <div><label class="lbl">סטטוס</label><input id="${prefix}Status" class="inp" placeholder="${type === "invoice" ? "שולם/פתוח" : "נשלח/טיוטה"}"></div>
      <div class="md:col-span-2"><label class="lbl">הערות</label><textarea id="${prefix}Notes" class="inp" rows="2"></textarea></div>
      <div class="md:col-span-2 flex gap-2 flex-wrap">
        <button type="button" id="${prefix}SaveBtn" class="btn-primary">שמור ${type === "invoice" ? "חשבונית" : "הצעה"}</button>
        <button type="button" id="${prefix}NewBtn" class="btn-secondary">חדש</button>
      </div>
    </form>`;

  $(`${prefix}SaveBtn`).onclick = () => saveFinancialDoc(type);
  $(`${prefix}NewBtn`).onclick = () => fillFinancialForm(type, null);
}

function fillFinancialForm(type, doc) {
  const p = type === "invoice" ? "inv" : "quo";
  $(`${p}Id`).value = doc ? String(doc.id) : "";
  $(`${p}No`).value = doc?.docNo || "";
  if (type === "invoice") $(`${p}Allocation`).value = doc?.allocationNo || "";
  $(`${p}IssueDate`).value = doc?.issueDate || "";
  $(`${p}DueDate`).value = doc?.dueDate || "";
  $(`${p}CustomerName`).value = doc?.customerName || "";
  $(`${p}CustomerId`).value = doc?.customerId || "";
  $(`${p}CustomerAddress`).value = doc?.customerAddress || "";
  $(`${p}Subtotal`).value = doc?.subtotal ?? "";
  $(`${p}TaxRate`).value = doc?.taxRate ?? 18;
  $(`${p}Status`).value = doc?.status || "";
  $(`${p}Notes`).value = doc?.notes || "";
}

function collectFinancialPayload(type) {
  const p = type === "invoice" ? "inv" : "quo";
  const subtotal = Number($(`${p}Subtotal`).value || 0);
  const taxRate = Number($(`${p}TaxRate`).value || 0);
  const taxAmount = subtotal * taxRate / 100;
  return {
    type,
    docNo: $(`${p}No`).value.trim(),
    allocationNo: type === "invoice" ? $(`${p}Allocation`).value.trim() : "",
    issueDate: $(`${p}IssueDate`).value,
    dueDate: $(`${p}DueDate`).value,
    customerName: $(`${p}CustomerName`).value.trim(),
    customerId: $(`${p}CustomerId`).value.trim(),
    customerAddress: $(`${p}CustomerAddress`).value.trim(),
    subtotal,
    taxRate,
    taxAmount,
    totalAmount: subtotal + taxAmount,
    status: $(`${p}Status`).value.trim(),
    notes: $(`${p}Notes`).value.trim(),
    items: [],
  };
}

async function saveFinancialDoc(type) {
  const payload = collectFinancialPayload(type);
  if (!payload.customerName) return alert("שם לקוח הוא שדה חובה.");
  const p = type === "invoice" ? "inv" : "quo";
  const id = $(`${p}Id`).value.trim();
  if (id) await api(`/api/financial-docs/${id}`, { method: "PUT", body: payload });
  else await api("/api/financial-docs", { method: "POST", body: payload });
  fillFinancialForm(type, null);
  await loadFinancial(type);
  refreshDashboardStats();
}

async function loadFinancial(type) {
  const rows = await api(`/api/financial-docs?type=${type}`);
  const tableId = type === "invoice" ? "invoicesTable" : "quotesTable";
  if (type === "invoice") invoicesCache = rows;
  else quotesCache = rows;
  const tbody = $(tableId);
  tbody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.docNo || "")}</td>
      ${type === "invoice" ? `<td>${escapeHtml(row.allocationNo || "")}</td>` : ""}
      <td>${escapeHtml(row.customerName || "")}</td>
      <td>${asMoney(row.totalAmount)}</td>
      <td>${escapeHtml(row.status || "")}</td>
      <td>
        <button type="button" class="text-blue-600 ml-2 edit">עריכה</button>
        <button type="button" class="text-red-600 del">מחיקה</button>
      </td>`;
    tr.querySelector(".edit").onclick = () => fillFinancialForm(type, row);
    tr.querySelector(".del").onclick = async () => {
      if (!confirm("למחוק רשומה?")) return;
      await api(`/api/financial-docs/${row.id}`, { method: "DELETE" });
      await loadFinancial(type);
      refreshDashboardStats();
    };
    tbody.appendChild(tr);
  });
}

async function refreshPortalData() {
  await Promise.all([loadProjects(), loadDocs(), loadFinancial("invoice"), loadFinancial("quote")]);
  refreshDashboardStats();
}

function refreshDashboardStats() {
  $("statProjects").textContent = String(projectCache.length);
  $("statDocs").textContent = String(docsCache.length);
  $("statInvoices").textContent = String(invoicesCache.length);
  $("statQuotes").textContent = String(quotesCache.length);
}

async function loadSettings() {
  settings = await api("/api/settings");
  renderHomeFromSettings();
  $("setName").value = settings.name || "";
  $("setLicense").value = settings.licenseNo || "";
  $("setPhone").value = settings.phone || "";
  $("setEmail").value = settings.email || "";
  $("setWhatsapp").value = settings.whatsapp || "";
  $("setAccessCode").value = settings.accessCode || "";
  $("setAboutText").value = settings.aboutText || "";
}

async function bindSettingsForm() {
  $("setLogoInput").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    settings.logoData = await readImageFile(f);
  });
  $("setStampInput").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    settings.stampData = await readImageFile(f);
  });
  $("saveSettingsBtn").onclick = async () => {
    try {
      settings.name = $("setName").value.trim();
      settings.licenseNo = $("setLicense").value.trim();
      settings.phone = $("setPhone").value.trim();
      settings.email = $("setEmail").value.trim();
      settings.whatsapp = $("setWhatsapp").value.trim();
      settings.accessCode = $("setAccessCode").value.trim();
      settings.aboutText = $("setAboutText").value.trim();
      settings = await api("/api/settings", { method: "PUT", body: settings });
      renderHomeFromSettings();
      showMsg("settingsMsg", "הגדרות נשמרו בהצלחה", true);
    } catch (e) {
      showMsg("settingsMsg", e.message, false);
    }
  };
}

function setupExport() {
  $("exportAccountantBtn").onclick = () => {
    window.open("/api/exports/accountant.csv", "_blank");
  };
}

window.addEventListener("DOMContentLoaded", async () => {
  setupDrawer();
  setupPortalTabs();
  setupPortalAuth();
  bindProjectForm();
  await bindDocForm();
  initDocSignature();
  renderFinancialForm("invoice");
  renderFinancialForm("quote");
  bindSettingsForm();
  setupExport();
  setSection("home");

  try {
    await api("/api/health");
    await loadSettings();
    fillProjectForm(null);
    fillDocForm(null);
    fillFinancialForm("invoice", null);
    fillFinancialForm("quote", null);
  } catch (e) {
    alert(`לא ניתן להתחבר לשרת: ${e.message}`);
  }
});
