/* global SignaturePad */
const API = "";
const WIZARD_STEPS = ["dashboard", "projects", "documents", "invoices", "quotes", "exports", "settings"];
const DEFAULT_HOME_CONTENT = {
  kicker: "חשמלאי מוסמך",
  title: "שירותי חשמל מקצועיים לבית, לעסק ולתעשייה",
  subtitle:
    "בדיקות תקינות, טיפול בלוחות חשמל, איתור ותיקון תקלות, תחזוקה ושדרוג מערכות חשמל - באחריות, בבטיחות ובסטנדרט עבודה גבוה.",
  primaryCta: "כניסה לאזור אישי",
  whatsappCta: "קבלת הצעת מחיר ב-WhatsApp",
  chip1: "",
  chip2: "",
  chip3: "",
  trustTitle1: "",
  trustText1: "",
  trustTitle2: "",
  trustText2: "",
  trustTitle3: "",
  trustText3: "",
  featureTitle1: "בדיקות תקינות חשמל",
  featureText1: "בדיקות מקיפות והנפקת אישורים מקצועיים לפי דרישות התקן.",
  featureTitle2: "איתור ותיקון תקלות",
  featureText2: "אבחון מדויק וטיפול מהיר בתקלות חשמל בבית ובעסק.",
  featureTitle3: "שדרוג ותחזוקה",
  featureText3: "שדרוג לוחות ותשתיות חשמל, תחזוקה תקופתית ושיפור בטיחות.",
  processTitle: "",
  step1: "",
  step2: "",
  step3: "",
  step4: "",
  galleryLabel1: "לוחות חשמל ובדיקות תקינות",
  galleryLabel2: "",
  galleryLabel3: "",
};

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
  homeContent: { ...DEFAULT_HOME_CONTENT },
  useBlankTemplate: false,
  blankTemplateData: null,
  blankOffsetXmm: 0,
  blankOffsetYmm: 0,
  blankScale: 1,
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
let deferredInstallPrompt = null;
let wizardIndex = 0;
const ACCESS_STORAGE_KEY = "ecs_accessibility_prefs_v1";

function $(id) {
  return document.getElementById(id);
}

function setInputValue(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value ?? "";
}

function setChecked(id, checked) {
  const el = $(id);
  if (!el) return;
  el.checked = !!checked;
}

function inputTrim(id) {
  const el = $(id);
  if (!el) return "";
  return String(el.value || "").trim();
}

function inputRaw(id) {
  const el = $(id);
  if (!el) return "";
  return String(el.value || "");
}

function openPrintableHtml(html) {
  const w = window.open("", "_blank");
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }
  printHtmlInHiddenIframe(html);
}

function printHtmlInHiddenIframe(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "הדפסה");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    alert("לא ניתן להכין תצוגת הדפסה. נסה שוב או השתמש בדפדפן אחר.");
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };
  const runPrint = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      /* ignore */
    }
    setTimeout(cleanup, 500);
  };
  if (iframe.contentDocument?.readyState === "complete") setTimeout(runPrint, 50);
  else iframe.onload = () => setTimeout(runPrint, 50);
}

function triggerFileDownload(url) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.target = "_blank";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  ["home", "about", "contact", "portal"].forEach((s) => {
    const el = $(`section-${s}`);
    if (el) el.classList.toggle("hidden", s !== section);
  });
}

function setupDrawer() {
  const drawer = $("drawer");
  const openBtn = $("drawerOpen");
  const closeBtn = $("drawerClose");
  if (!drawer || !openBtn || !closeBtn) return;
  const closeDrawer = () => drawer.classList.add("hidden");
  openBtn.onclick = () => drawer.classList.remove("hidden");
  closeBtn.onclick = closeDrawer;
  drawer.addEventListener("click", (ev) => {
    if (ev.target === drawer) closeDrawer();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeDrawer();
  });
  document.querySelectorAll(".drawer-link").forEach((btn) => {
    btn.onclick = () => {
      setSection(btn.dataset.section);
      closeDrawer();
    };
  });
  document.querySelectorAll("[data-go-portal]").forEach((btn) => {
    btn.onclick = () => setSection("portal");
  });
}

function setupHomeShowcase() {
  const lightbox = $("galleryLightbox");
  const lightboxImage = $("lightboxImage");
  const lightboxClose = $("lightboxClose");
  if (!lightbox || !lightboxImage || !lightboxClose) return;

  const close = () => {
    lightbox.classList.add("hidden");
    lightboxImage.src = "";
    lightboxImage.alt = "";
  };

  document.querySelectorAll("[data-gallery-src]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.getAttribute("data-gallery-src");
      const alt = btn.getAttribute("data-gallery-alt") || "";
      if (!src) return;
      lightboxImage.src = src;
      lightboxImage.alt = alt;
      lightbox.classList.remove("hidden");
    });
  });

  lightboxClose.addEventListener("click", close);
  lightbox.addEventListener("click", (ev) => {
    if (ev.target === lightbox) close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !lightbox.classList.contains("hidden")) close();
  });
}

function renderHomeFromSettings() {
  const hc = { ...DEFAULT_HOME_CONTENT, ...(settings.homeContent || {}) };
  const getEl = (id) => $(id);
  const setText = (id, value) => {
    const el = getEl(id);
    if (!el) return;
    if (value == null || value === "") el.textContent = "";
    else el.textContent = typeof value === "string" ? value : String(value);
  };
  setText("heroInspectorName", settings.name || "אברהם רובינשטיין - חשמלאי מוסמך");
  setText("contactName", settings.name || "—");
  setText("contactPhone", settings.phone || "—");
  setText("contactEmail", settings.email || "—");
  setText("aboutText", settings.aboutText || "");
  setText("homeHeroKicker", hc.kicker);
  setText("homeHeroTitle", hc.title);
  setText("homeHeroSubtitle", hc.subtitle);
  setText("homePrimaryCta", hc.primaryCta);
  setText("whatsappTopLink", hc.whatsappCta);
  setText("homeFeatureTitle1", hc.featureTitle1);
  setText("homeFeatureText1", hc.featureText1);
  setText("homeFeatureTitle2", hc.featureTitle2);
  setText("homeFeatureText2", hc.featureText2);
  setText("homeFeatureTitle3", hc.featureTitle3);
  setText("homeFeatureText3", hc.featureText3);
  setText("homeGalleryLabel1", hc.galleryLabel1);
  setText("homeGalleryLabel2", hc.galleryLabel2);
  setText("homeGalleryLabel3", hc.galleryLabel3);

  const href = toWaHref(settings.whatsapp || settings.phone);
  const wa = getEl("whatsappLink");
  const waTop = getEl("whatsappTopLink");
  const waFloat = getEl("whatsappFloatingCta");
  if (wa) wa.href = href;
  if (waTop) waTop.href = href;
  if (waFloat) waFloat.href = href;
}

function readAccessPrefs() {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAccessPrefs(next) {
  localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(next));
}

function applyAccessPrefs(prefs) {
  document.body.classList.toggle("high-contrast", !!prefs.contrast);
  document.body.classList.toggle("underline-links", !!prefs.underlineLinks);
  document.body.classList.toggle("grayscale", !!prefs.grayscale);
  const size = Number(prefs.fontSize || 16);
  document.body.style.setProperty("--base-font-size", `${Math.min(22, Math.max(14, size))}px`);
}

function setupAccessibilityToolbar() {
  const toggle = $("accessToggle");
  const panel = $("accessPanel");
  if (!toggle || !panel) return;
  const prefs = readAccessPrefs();
  applyAccessPrefs(prefs);

  toggle.onclick = () => {
    panel.classList.toggle("hidden");
    toggle.setAttribute("aria-expanded", String(!panel.classList.contains("hidden")));
  };

  panel.querySelectorAll("button[data-access]").forEach((btn) => {
    btn.onclick = () => {
      const action = btn.dataset.access;
      const state = readAccessPrefs();
      if (action === "font-plus") state.fontSize = Math.min(22, Number(state.fontSize || 16) + 1);
      if (action === "font-minus") state.fontSize = Math.max(14, Number(state.fontSize || 16) - 1);
      if (action === "contrast") state.contrast = !state.contrast;
      if (action === "underline-links") state.underlineLinks = !state.underlineLinks;
      if (action === "grayscale") state.grayscale = !state.grayscale;
      if (action === "reset") {
        localStorage.removeItem(ACCESS_STORAGE_KEY);
        applyAccessPrefs({});
        return;
      }
      writeAccessPrefs(state);
      applyAccessPrefs(state);
    };
  });
}

function setWizardStepByIndex(index) {
  wizardIndex = Math.max(0, Math.min(WIZARD_STEPS.length - 1, index));
  const name = WIZARD_STEPS[wizardIndex];
  document.querySelectorAll(".wizard-step-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i === wizardIndex);
    btn.classList.toggle("done", i < wizardIndex);
  });
  document.querySelectorAll(".portal-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `portal-${name}`);
  });
  const stepLabel = $("wizardStepLabel");
  if (stepLabel) stepLabel.textContent = `שלב ${wizardIndex + 1} מתוך ${WIZARD_STEPS.length}`;
  const prev = $("wizardPrevBtn");
  if (prev) prev.disabled = wizardIndex === 0;
  const next = $("wizardNextBtn");
  if (next) next.textContent = wizardIndex === WIZARD_STEPS.length - 1 ? "סיום" : "הבא";
}

function setupPortalWizard() {
  document.querySelectorAll(".wizard-step-btn").forEach((btn) => {
    btn.onclick = () => {
      const target = WIZARD_STEPS.indexOf(btn.dataset.portalTab);
      if (target >= 0) setWizardStepByIndex(target);
    };
  });
  const prev = $("wizardPrevBtn");
  const next = $("wizardNextBtn");
  if (prev) prev.onclick = () => setWizardStepByIndex(wizardIndex - 1);
  if (next) next.onclick = () => setWizardStepByIndex(wizardIndex + 1);
  setWizardStepByIndex(0);
}

function ensurePortalOpen() {
  const gate = $("portalGate");
  const area = $("portalArea");
  if (gate) gate.classList.add("hidden");
  if (area) area.classList.remove("hidden");
  isPortalOpen = true;
}

function logoutPortal() {
  isPortalOpen = false;
  const gate = $("portalGate");
  const area = $("portalArea");
  if (gate) gate.classList.remove("hidden");
  if (area) area.classList.add("hidden");
  setInputValue("accessCodeInput", "");
}

function setupPortalAuth() {
  const tryLogin = () => {
    const input = $("accessCodeInput");
    const userCode = (input?.value || "").trim();
    const expected = String(settings.accessCode || "1234").trim();
    if (!expected || userCode === expected) {
      showMsg("accessMsg", "כניסה בוצעה בהצלחה.", true);
      ensurePortalOpen();
      refreshPortalData();
    } else {
      showMsg("accessMsg", "קוד שגוי.", false);
    }
  };

  const form = $("portalLoginForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      tryLogin();
    });
  }

  const loginBtn = $("accessLoginBtn");
  if (loginBtn) loginBtn.onclick = tryLogin;

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logoutPortal;
}

function renderThumbGrid(containerId, list, onDelete) {
  const box = $(containerId);
  if (!box) return;
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
  const photosInput = $("projectPhotosInput");
  if (!photosInput) return;
  photosInput.addEventListener("change", async (e) => {
    for (const f of Array.from(e.target.files || [])) {
      if (!f.type.startsWith("image/")) continue;
      projectPhotos.push({ name: f.name, data: await readImageFile(f) });
    }
    e.target.value = "";
    renderProjectPhotos();
  });

  const newBtn = $("newProjectBtn");
  const saveBtn = $("saveProjectBtn");
  if (newBtn) newBtn.onclick = () => fillProjectForm(null);
  if (saveBtn) saveBtn.onclick = saveProject;
}

function fillProjectForm(project) {
  setInputValue("projectId", project ? String(project.id) : "");
  setInputValue("projectTitle", project?.title || "");
  setInputValue("projectClient", project?.clientName || "");
  setInputValue("projectAddress", project?.address || "");
  setInputValue("projectStatus", project?.status || "planned");
  setInputValue("projectStarted", project?.startedOn || "");
  setInputValue("projectCompleted", project?.completedOn || "");
  setInputValue("projectDescription", project?.description || "");
  projectPhotos = project?.photos ? project.photos.slice() : [];
  renderProjectPhotos();
}

async function saveProject() {
  const payload = {
    title: inputTrim("projectTitle"),
    clientName: inputTrim("projectClient"),
    address: inputTrim("projectAddress"),
    status: inputRaw("projectStatus"),
    startedOn: inputRaw("projectStarted"),
    completedOn: inputRaw("projectCompleted"),
    description: inputTrim("projectDescription"),
    photos: projectPhotos,
  };
  if (!payload.title) return alert("יש להזין שם פרויקט.");
  const id = inputTrim("projectId");
  if (id) await api(`/api/projects/${id}`, { method: "PUT", body: payload });
  else await api("/api/projects", { method: "POST", body: payload });
  fillProjectForm(null);
  await loadProjects();
}

async function loadProjects() {
  projectCache = await api("/api/projects");
  const tbody = $("projectsTable");
  if (!tbody) return;
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
  if (!canvas || typeof SignaturePad === "undefined") {
    docSignaturePad = null;
    return;
  }
  docSignaturePad = new SignaturePad(canvas, { minWidth: 0.6, maxWidth: 2.2, penColor: "#0f172a" });
  const resize = () => {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = canvas.parentElement?.clientWidth || canvas.clientWidth || 300;
    canvas.width = w * ratio;
    canvas.height = 160 * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    docSignaturePad.clear();
  };
  resize();
  window.addEventListener("resize", resize);
  const clearBtn = $("docClearSig");
  if (clearBtn) clearBtn.onclick = () => docSignaturePad?.clear();
}

async function bindDocForm() {
  const photosInput = $("docPhotosInput");
  if (photosInput) {
    photosInput.addEventListener("change", async (e) => {
      for (const f of Array.from(e.target.files || [])) {
        if (!f.type.startsWith("image/")) continue;
        docPhotos.push({ name: f.name, data: await readImageFile(f) });
      }
      e.target.value = "";
      renderDocPhotos();
    });
  }
  const newBtn = $("newDocBtn");
  const saveBtn = $("saveDocBtn");
  const printBtn = $("printDocBtn");
  if (newBtn) newBtn.onclick = () => fillDocForm(null);
  if (saveBtn) saveBtn.onclick = saveDoc;
  if (printBtn) printBtn.onclick = printCurrentDoc;
}

function renderDocPhotos() {
  renderThumbGrid("docPhotosPreview", docPhotos, (i) => {
    docPhotos.splice(i, 1);
    renderDocPhotos();
  });
}

function fillDocForm(doc) {
  setInputValue("docId", doc ? String(doc.id) : "");
  setInputValue("docType", doc?.docType || "installation");
  setInputValue("docFacilityName", doc?.facilityName || "");
  setInputValue("docAddress", doc?.address || "");
  setInputValue("docConnection", doc?.connectionSize || "");
  setInputValue("docGrounding", doc?.groundingValue || "");
  setInputValue("docInsulation", doc?.insulation || "");
  setInputValue("docNotes", doc?.notes || "");
  docPhotos = doc?.photos ? doc.photos.slice() : [];
  renderDocPhotos();
  if (docSignaturePad) {
    docSignaturePad.clear();
    if (doc?.signatureData) docSignaturePad.fromDataURL(doc.signatureData);
  }
}

function buildDocPayload() {
  return {
    docType: inputRaw("docType"),
    facilityName: inputTrim("docFacilityName"),
    address: inputTrim("docAddress"),
    connectionSize: inputTrim("docConnection"),
    groundingValue: inputTrim("docGrounding"),
    insulation: inputTrim("docInsulation"),
    notes: inputTrim("docNotes"),
    photos: docPhotos,
    extra: {},
    signatureData:
      docSignaturePad && !docSignaturePad.isEmpty() ? docSignaturePad.toDataURL("image/png") : null,
  };
}

async function saveDoc() {
  const payload = buildDocPayload();
  if (!payload.facilityName) return alert("שם מתקן הוא שדה חובה.");
  const id = inputTrim("docId");
  if (id) await api(`/api/certificates/${id}`, { method: "PUT", body: payload });
  else {
    const created = await api("/api/certificates", { method: "POST", body: payload });
    setInputValue("docId", String(created.id));
  }
  await loadDocs();
  refreshDashboardStats();
}

function printDoc(doc) {
  const when = fmtDate(doc.updatedAt || doc.createdAt || new Date().toISOString());
  const title = doc.docType === "portable" ? "אישור צרכנים מטלטלים" : "אישור תקינות מתקן";
  const photosHtml = (doc.photos || []).map((p) => `<img src="${p.data}" style="width:140px;height:100px;object-fit:cover;border:1px solid #ddd;border-radius:6px">`).join("");
  const standardLayout = `<div class="max-w-[210mm] mx-auto p-8">
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
  </div>`;
  const blankLayout = `
    <div class="blank-sheet">
      ${settings.blankTemplateData ? `<img src="${settings.blankTemplateData}" class="blank-bg" alt="">` : ""}
      <div class="blank-content">
        <div class="grid grid-cols-2 gap-2 text-sm border rounded p-3 bg-white/90 mb-4">
          <div><b>סוג מסמך:</b> ${title}</div>
          <div><b>תאריך:</b> ${escapeHtml(when)}</div>
          <div><b>שם מתקן:</b> ${escapeHtml(doc.facilityName)}</div>
          <div><b>כתובת:</b> ${escapeHtml(doc.address || "")}</div>
          <div><b>גודל חיבור:</b> ${escapeHtml(doc.connectionSize || "")}</div>
          <div><b>הארקה:</b> ${escapeHtml(doc.groundingValue || "")}</div>
          <div><b>בידוד:</b> ${escapeHtml(doc.insulation || "")}</div>
          <div><b>בודק:</b> ${escapeHtml(settings.name || "")}</div>
        </div>
        <div class="mb-4 bg-white/90 border rounded p-2 min-h-[40px] whitespace-pre-wrap"><b>הערות:</b> ${escapeHtml(doc.notes || "")}</div>
        ${photosHtml ? `<div class="mb-4 flex gap-2 flex-wrap">${photosHtml}</div>` : ""}
        <div class="flex justify-between items-end mt-8">
          <div>${settings.stampData ? `<img src="${settings.stampData}" style="max-width:110px;max-height:90px">` : ""}</div>
          <div class="text-center">
            ${doc.signatureData ? `<img src="${doc.signatureData}" style="height:80px">` : `<div style="height:80px"></div>`}
            <div class="border-t pt-1 text-sm">חתימה וחותמת</div>
          </div>
        </div>
      </div>
    </div>`;
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    .blank-sheet{position:relative;max-width:210mm;min-height:287mm;margin:0 auto;padding:12mm}
    .blank-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;transform:translate(${Number(settings.blankOffsetXmm || 0)}mm, ${Number(settings.blankOffsetYmm || 0)}mm) scale(${Math.min(1.2, Math.max(0.8, Number(settings.blankScale || 1)))});transform-origin:top right}
    .blank-content{position:relative;z-index:1}
  </style>
  </head><body>
  ${settings.useBlankTemplate ? blankLayout : standardLayout}
  <script>window.onload=()=>{window.print()};<\/script></body></html>`;
  openPrintableHtml(html);
}

async function printCurrentDoc() {
  const id = inputTrim("docId");
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
  if (!tbody) return;
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
  if (!wrap) return;
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

  const saveBtn = $(`${prefix}SaveBtn`);
  const newBtn = $(`${prefix}NewBtn`);
  if (saveBtn) saveBtn.onclick = () => saveFinancialDoc(type);
  if (newBtn) newBtn.onclick = () => fillFinancialForm(type, null);
}

function fillFinancialForm(type, doc) {
  const p = type === "invoice" ? "inv" : "quo";
  setInputValue(`${p}Id`, doc ? String(doc.id) : "");
  setInputValue(`${p}No`, doc?.docNo || "");
  if (type === "invoice") setInputValue(`${p}Allocation`, doc?.allocationNo || "");
  setInputValue(`${p}IssueDate`, doc?.issueDate || "");
  setInputValue(`${p}DueDate`, doc?.dueDate || "");
  setInputValue(`${p}CustomerName`, doc?.customerName || "");
  setInputValue(`${p}CustomerId`, doc?.customerId || "");
  setInputValue(`${p}CustomerAddress`, doc?.customerAddress || "");
  setInputValue(`${p}Subtotal`, doc?.subtotal ?? "");
  setInputValue(`${p}TaxRate`, doc?.taxRate ?? 18);
  setInputValue(`${p}Status`, doc?.status || "");
  setInputValue(`${p}Notes`, doc?.notes || "");
}

function collectFinancialPayload(type) {
  const p = type === "invoice" ? "inv" : "quo";
  const subtotal = Number(inputRaw(`${p}Subtotal`) || 0);
  const taxRate = Number(inputRaw(`${p}TaxRate`) || 0);
  const taxAmount = subtotal * taxRate / 100;
  return {
    type,
    docNo: inputTrim(`${p}No`),
    allocationNo: type === "invoice" ? inputTrim(`${p}Allocation`) : "",
    issueDate: inputRaw(`${p}IssueDate`),
    dueDate: inputRaw(`${p}DueDate`),
    customerName: inputTrim(`${p}CustomerName`),
    customerId: inputTrim(`${p}CustomerId`),
    customerAddress: inputTrim(`${p}CustomerAddress`),
    subtotal,
    taxRate,
    taxAmount,
    totalAmount: subtotal + taxAmount,
    status: inputTrim(`${p}Status`),
    notes: inputTrim(`${p}Notes`),
    items: [],
  };
}

async function saveFinancialDoc(type) {
  const payload = collectFinancialPayload(type);
  if (!payload.customerName) return alert("שם לקוח הוא שדה חובה.");
  const p = type === "invoice" ? "inv" : "quo";
  const id = inputTrim(`${p}Id`);
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
  if (!tbody) return;
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
  const sp = $("statProjects");
  const sd = $("statDocs");
  const si = $("statInvoices");
  const sq = $("statQuotes");
  if (sp) sp.textContent = String(projectCache.length);
  if (sd) sd.textContent = String(docsCache.length);
  if (si) si.textContent = String(invoicesCache.length);
  if (sq) sq.textContent = String(quotesCache.length);
}

async function loadSettings() {
  settings = await api("/api/settings");
  renderHomeFromSettings();
  setInputValue("setName", settings.name || "");
  setInputValue("setLicense", settings.licenseNo || "");
  setInputValue("setPhone", settings.phone || "");
  setInputValue("setEmail", settings.email || "");
  setInputValue("setWhatsapp", settings.whatsapp || "");
  setInputValue("setAccessCode", settings.accessCode || "");
  setInputValue("setAboutText", settings.aboutText || "");
  const hc = { ...DEFAULT_HOME_CONTENT, ...(settings.homeContent || {}) };
  setInputValue("setHomeKicker", hc.kicker);
  setInputValue("setHomeTitle", hc.title);
  setInputValue("setHomeSubtitle", hc.subtitle);
  setInputValue("setHomePrimaryCta", hc.primaryCta);
  setInputValue("setHomeWhatsappCta", hc.whatsappCta);
  setInputValue("setHomeChip1", hc.chip1);
  setInputValue("setHomeChip2", hc.chip2);
  setInputValue("setHomeChip3", hc.chip3);
  setInputValue("setHomeTrustTitle1", hc.trustTitle1);
  setInputValue("setHomeTrustText1", hc.trustText1);
  setInputValue("setHomeTrustTitle2", hc.trustTitle2);
  setInputValue("setHomeTrustText2", hc.trustText2);
  setInputValue("setHomeTrustTitle3", hc.trustTitle3);
  setInputValue("setHomeTrustText3", hc.trustText3);
  setInputValue("setHomeFeatureTitle1", hc.featureTitle1);
  setInputValue("setHomeFeatureText1", hc.featureText1);
  setInputValue("setHomeFeatureTitle2", hc.featureTitle2);
  setInputValue("setHomeFeatureText2", hc.featureText2);
  setInputValue("setHomeFeatureTitle3", hc.featureTitle3);
  setInputValue("setHomeFeatureText3", hc.featureText3);
  setInputValue("setHomeProcessTitle", hc.processTitle);
  setInputValue("setHomeStep1", hc.step1);
  setInputValue("setHomeStep2", hc.step2);
  setInputValue("setHomeStep3", hc.step3);
  setInputValue("setHomeStep4", hc.step4);
  setInputValue("setHomeGalleryLabel1", hc.galleryLabel1);
  setInputValue("setHomeGalleryLabel2", hc.galleryLabel2);
  setInputValue("setHomeGalleryLabel3", hc.galleryLabel3);
  setChecked("setUseBlankTemplate", !!settings.useBlankTemplate);
  setInputValue("setBlankOffsetX", String(Number(settings.blankOffsetXmm || 0)));
  setInputValue("setBlankOffsetY", String(Number(settings.blankOffsetYmm || 0)));
  setInputValue("setBlankScale", String(Number(settings.blankScale || 1)));
}

async function bindSettingsForm() {
  const logoIn = $("setLogoInput");
  if (logoIn) {
    logoIn.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      settings.logoData = await readImageFile(f);
    });
  }
  const stampIn = $("setStampInput");
  if (stampIn) {
    stampIn.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      settings.stampData = await readImageFile(f);
    });
  }
  const blankIn = $("setBlankTemplateInput");
  if (blankIn) {
    blankIn.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      settings.blankTemplateData = await readImageFile(f);
    });
  }
  const saveBtn = $("saveSettingsBtn");
  if (!saveBtn) return;
  saveBtn.onclick = async () => {
    try {
      settings.name = inputTrim("setName");
      settings.licenseNo = inputTrim("setLicense");
      settings.phone = inputTrim("setPhone");
      settings.email = inputTrim("setEmail");
      settings.whatsapp = inputTrim("setWhatsapp");
      settings.accessCode = inputTrim("setAccessCode");
      settings.aboutText = inputTrim("setAboutText");
      settings.homeContent = {
        kicker: inputTrim("setHomeKicker"),
        title: inputTrim("setHomeTitle"),
        subtitle: inputTrim("setHomeSubtitle"),
        primaryCta: inputTrim("setHomePrimaryCta"),
        whatsappCta: inputTrim("setHomeWhatsappCta"),
        chip1: inputTrim("setHomeChip1"),
        chip2: inputTrim("setHomeChip2"),
        chip3: inputTrim("setHomeChip3"),
        trustTitle1: inputTrim("setHomeTrustTitle1"),
        trustText1: inputTrim("setHomeTrustText1"),
        trustTitle2: inputTrim("setHomeTrustTitle2"),
        trustText2: inputTrim("setHomeTrustText2"),
        trustTitle3: inputTrim("setHomeTrustTitle3"),
        trustText3: inputTrim("setHomeTrustText3"),
        featureTitle1: inputTrim("setHomeFeatureTitle1"),
        featureText1: inputTrim("setHomeFeatureText1"),
        featureTitle2: inputTrim("setHomeFeatureTitle2"),
        featureText2: inputTrim("setHomeFeatureText2"),
        featureTitle3: inputTrim("setHomeFeatureTitle3"),
        featureText3: inputTrim("setHomeFeatureText3"),
        processTitle: inputTrim("setHomeProcessTitle"),
        step1: inputTrim("setHomeStep1"),
        step2: inputTrim("setHomeStep2"),
        step3: inputTrim("setHomeStep3"),
        step4: inputTrim("setHomeStep4"),
        galleryLabel1: inputTrim("setHomeGalleryLabel1"),
        galleryLabel2: inputTrim("setHomeGalleryLabel2"),
        galleryLabel3: inputTrim("setHomeGalleryLabel3"),
      };
      const blankTpl = $("setUseBlankTemplate");
      settings.useBlankTemplate = !!blankTpl?.checked;
      settings.blankOffsetXmm = Number(inputRaw("setBlankOffsetX") || 0);
      settings.blankOffsetYmm = Number(inputRaw("setBlankOffsetY") || 0);
      settings.blankScale = Number(inputRaw("setBlankScale") || 1);
      settings = await api("/api/settings", { method: "PUT", body: settings });
      renderHomeFromSettings();
      showMsg("settingsMsg", "הגדרות נשמרו בהצלחה", true);
    } catch (e) {
      showMsg("settingsMsg", e.message, false);
    }
  };
}

function setupExport() {
  const btn = $("exportAccountantBtn");
  if (!btn) return;
  btn.onclick = () => {
    triggerFileDownload("/api/exports/accountant.csv");
  };
}

function setupPwaInstall() {
  const installBtn = $("pwaInstallBtn");
  if (!installBtn) return;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isStandalone) installBtn.classList.add("hidden");

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBtn.classList.add("hidden");
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.classList.remove("hidden");
  });

  installBtn.onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.classList.add("hidden");
  };
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.update().catch(() => {});
      }).catch(() => {});
    });
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  setupDrawer();
  setupHomeShowcase();
  setupAccessibilityToolbar();
  setupPortalWizard();
  setupPortalAuth();
  bindProjectForm();
  await bindDocForm();
  initDocSignature();
  renderFinancialForm("invoice");
  renderFinancialForm("quote");
  bindSettingsForm();
  setupExport();
  setupPwaInstall();
  registerServiceWorker();
  setSection("home");

  try {
    await api("/api/health");
  } catch (e) {
    console.error(e);
    alert(`שגיאת חיבור לשרת (בדיקת /api/health): ${e.message}`);
    return;
  }
  try {
    await loadSettings();
  } catch (e) {
    console.error(e);
    alert(`שגיאה בטעינת הגדרות: ${e.message}`);
    return;
  }
  try {
    fillProjectForm(null);
    fillDocForm(null);
    fillFinancialForm("invoice", null);
    fillFinancialForm("quote", null);
  } catch (e) {
    console.error(e);
    alert(`שגיאה באתחול טפסים בממשק: ${e.message}`);
  }
});
