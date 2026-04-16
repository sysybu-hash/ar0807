/* global SignaturePad */
import { api, apiBlob, getToken, setToken, clearToken } from "./js/api.js";
import {
  enqueueProjectWizardPayload,
  processPendingWizardQueue,
  countPendingWizard,
} from "./js/offline-queue.js";
const WIZARD_STEPS = ["dashboard", "projects", "documents", "invoices", "quotes", "exports", "settings"];
const DEFAULT_HOME_CONTENT = {
  kicker: "חשמלאי מוסמך · שירות אישי ומקצועי",
  title:
    "רובינשטיין חשמל\nחשמל מקצועי, בטוח ומדויק",
  subtitle:
    "בדיקות תקינות, לוחות חשמל, איתור תקלות ושדרוגים — עם תיעוד מלא, עמידה בתקן IEC ובדרישות רשות החשמל, ושירות אישי לבית, לעסק ולמשרד.",
  primaryCta: "כניסה לאזור אישי",
  whatsappCta: "הצעת מחיר ב-WhatsApp",
  chip1: "זמינות ומענה מהיר",
  chip2: "מגורים · משרדים · עסקים",
  chip3: "תקן מקומי ובינלאומי",
  sectionServicesKicker: "מה אנחנו עושים",
  sectionServicesTitle: "שירותי חשמל מקצה לקצה",
  sectionServicesSub:
    "מבדיקת תקינות ועד שדרוג הלוח — הכל תחת אחריות מקצועית של רובינשטיין חשמל.",
  sectionGalleryKicker: "בשטח",
  sectionGalleryTitle: "עבודות שנראות כמו שצריך",
  sectionGallerySub:
    "לוחות מסודרים, בדיקות מדויקות ותאורה נקייה — הדברים הקטנים שעושים את ההבדל.",
  ctaTitle: "רוצים הצעת מחיר או בדיקת תקינות?",
  ctaSubtitle:
    "נשמח לשמוע על הפרויקט — מענה מהיר ב-WhatsApp או דרך צור קשר.",
  trustTitle1: "",
  trustText1: "",
  trustTitle2: "",
  trustText2: "",
  trustTitle3: "",
  trustText3: "",
  featureTitle1: "בדיקות תקינות חשמל",
  featureText1:
    "בדיקות מקיפות, תיעוד ממצאים והנפת אישור תקינות — לפי התקן הישראלי והאירופי IEC 60364.",
  featureTitle2: "איתור ותיקון תקלות",
  featureText2:
    "אבחון מהיר עם ציוד מדידה מקצועי, תיקון בטוח ומניעת חזרת התקלה — בבית או בעסק.",
  featureTitle3: "שדרוג לוחות ותחזוקה",
  featureText3:
    "שדרוג לוחות ומפסקים, הרחבות חשמל ותחזוקה שוטפת — בהתאמה לרשות החשמל ולבטיחות הדיירים.",
  processTitle: "",
  step1: "",
  step2: "",
  step3: "",
  step4: "",
  galleryLabel1: "לוח חשמל מסודר ומקצועי",
  galleryLabel2: "בדיקות תקינות בשטח",
  galleryLabel3: "תאורה וחשמל במגורים",
};

let settings = {
  name: "",
  licenseNo: "",
  phone: "",
  email: "",
  whatsapp: "",
  aboutText: "",
  logoData: null,
  stampData: null,
  homeContent: {},
  useBlankTemplate: false,
  blankTemplateData: null,
  blankOffsetXmm: 0,
  blankOffsetYmm: 0,
  blankScale: 1,
  inspectorDeclarationText: "",
  stampOffsetXmm: 0,
  stampOffsetYmm: 0,
  accessCode: "",
};

/** Merge server payload without wiping keys omitted in partial (public) responses. */
function mergeServerSettings(data) {
  if (!data || typeof data !== "object") return;
  for (const k of Object.keys(data)) {
    if (data[k] === undefined) continue;
    if (k === "homeContent" && data.homeContent && typeof data.homeContent === "object") {
      settings.homeContent = { ...settings.homeContent, ...data.homeContent };
      continue;
    }
    settings[k] = data[k];
  }
  settings.accessCode = "";
}

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

const WIZARD_PROJECT_STEPS = [
  { key: "client", title: "פרטי פרויקט ולקוח" },
  { key: "system", title: "סוג מערכת והספק" },
  { key: "tasks", title: "משימות והערות" },
  { key: "signature", title: "אישור בוחן — חתימה" },
];

class ProjectWizard {
  constructor() {
    this.currentStep = 0;
    this.formData = {
      name: "",
      clientName: "",
      address: "",
      systemType: "חד-פאזי",
      amperage: "",
      notes: "",
      tasks: [],
      signatureBase64: "",
    };
    this.sigPad = null;
    this.modal = null;
  }

  open() {
    this.modal = $("projectWizardModal");
    if (!this.modal) return;
    this.currentStep = 0;
    this.resetData();
    this.modal.classList.remove("hidden");
    this.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    this.renderStep();
    this.bindOnce();
  }

  close() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    this.sigPad = null;
  }

  resetData() {
    this.formData = {
      name: "",
      clientName: "",
      address: "",
      systemType: "חד-פאזי",
      amperage: "",
      notes: "",
      tasks: [],
      signatureBase64: "",
    };
  }

  collectFromDom() {
    const g = (id) => String($(id)?.value ?? "").trim();
    if ($("wiz-name")) this.formData.name = g("wiz-name");
    if ($("wiz-client")) this.formData.clientName = g("wiz-client");
    if ($("wiz-address")) this.formData.address = g("wiz-address");
    if ($("wiz-system")) this.formData.systemType = g("wiz-system") || "חד-פאזי";
    if ($("wiz-amp")) this.formData.amperage = g("wiz-amp");
    if ($("wiz-notes")) this.formData.notes = g("wiz-notes");
    const taskChecks = document.querySelectorAll('input[name="wiz-task"]:checked');
    if (document.querySelector('input[name="wiz-task"]'))
      this.formData.tasks = Array.from(taskChecks).map((el) => el.value);
    if (this.sigPad && !this.sigPad.isEmpty()) {
      this.formData.signatureBase64 = this.sigPad.toDataURL("image/png");
    }
  }

  softHighlight() {
    document.querySelectorAll(".wiz-soft").forEach((el) => {
      el.classList.remove("ring-2", "ring-amber-400/80", "ring-offset-2", "ring-offset-gray-900");
    });
    const step = WIZARD_PROJECT_STEPS[this.currentStep];
    if (!step) return;
    const rec = {
      client: ["wiz-name", "wiz-client"],
      system: ["wiz-system", "wiz-amp"],
      tasks: ["wiz-notes"],
      signature: [],
    }[step.key];
    (rec || []).forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (!String(el.value || "").trim()) {
        el.classList.add("ring-2", "ring-amber-400/80", "ring-offset-2", "ring-offset-gray-900");
        el.classList.add("wiz-soft");
      }
    });
  }

  renderStep() {
    const wrap = $("wizard-content");
    const totalEl = $("wizard-total-steps");
    const curNum = $("current-step-num");
    const titleEl = $("step-title");
    const bar = $("progress-bar-fill");
    const btnPrev = $("btn-prev");
    const btnNext = $("btn-next");
    const btnSave = $("btn-save");
    if (!wrap || !totalEl || !curNum || !titleEl || !bar || !btnPrev || !btnNext || !btnSave) return;

    const total = WIZARD_PROJECT_STEPS.length;
    totalEl.textContent = String(total);
    curNum.textContent = String(this.currentStep + 1);
    titleEl.textContent = WIZARD_PROJECT_STEPS[this.currentStep]?.title || "";
    const pct = ((this.currentStep + 1) / total) * 100;
    bar.style.width = `${pct}%`;

    const k = WIZARD_PROJECT_STEPS[this.currentStep].key;
    if (k === "client") {
      wrap.innerHTML = `
        <div class="space-y-4 text-right">
          <p class="text-sm text-gray-400">שדות מומלצים מסומנים — ניתן להמשיך גם בלי למלא (יודגשו בצהוב עדין).</p>
          <div>
            <label class="block text-xs text-gray-400 mb-1" for="wiz-name">שם פרויקט *</label>
            <input id="wiz-name" type="text" class="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white text-sm" value="${escapeHtml(this.formData.name)}" autocomplete="off" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1" for="wiz-client">שם לקוח (מומלץ)</label>
            <input id="wiz-client" type="text" class="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white text-sm" value="${escapeHtml(this.formData.clientName)}" autocomplete="off" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1" for="wiz-address">כתובת (מומלץ)</label>
            <input id="wiz-address" type="text" class="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white text-sm" value="${escapeHtml(this.formData.address)}" autocomplete="off" />
          </div>
        </div>`;
    } else if (k === "system") {
      wrap.innerHTML = `
        <div class="space-y-4 text-right">
          <div>
            <label class="block text-xs text-gray-400 mb-1" for="wiz-system">סוג מערכת (מומלץ)</label>
            <select id="wiz-system" class="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white text-sm">
              <option value="חד-פאזי" ${this.formData.systemType === "חד-פאזי" ? "selected" : ""}>חד-פאזי</option>
              <option value="תלת-פאזי" ${this.formData.systemType === "תלת-פאזי" ? "selected" : ""}>תלת-פאזי</option>
              <option value="זרם חוזר" ${this.formData.systemType === "זרם חוזר" ? "selected" : ""}>זרם חוזר</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1" for="wiz-amp">זרם / הספק (מומלץ)</label>
            <input id="wiz-amp" type="text" class="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white text-sm" placeholder="למשל 40A / 12 kW" value="${escapeHtml(this.formData.amperage)}" />
          </div>
        </div>`;
    } else if (k === "tasks") {
      const opts = [
        { v: "בדיקת לוח", l: "בדיקת לוח ראשי" },
        { v: "הארקה", l: "בדיקת הארקה" },
        { v: "תאורה", l: "התקנת תאורה" },
        { v: "תקשורת", l: "נקודות תקשורת" },
      ];
      const checked = new Set(this.formData.tasks);
      wrap.innerHTML = `
        <div class="space-y-4 text-right">
          <p class="text-sm text-gray-400">בחר משימות צפויות (אופציונלי).</p>
          <div class="grid grid-cols-1 gap-2">
            ${opts
              .map(
                (o) => `
              <label class="flex items-center gap-2 justify-end text-sm text-gray-200 cursor-pointer">
                <span>${escapeHtml(o.l)}</span>
                <input type="checkbox" name="wiz-task" value="${escapeHtml(o.v)}" class="rounded border-gray-600" ${checked.has(o.v) ? "checked" : ""} />
              </label>`
              )
              .join("")}
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1" for="wiz-notes">הערות (מומלץ)</label>
            <textarea id="wiz-notes" rows="4" class="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white text-sm">${escapeHtml(this.formData.notes)}</textarea>
          </div>
        </div>`;
    } else if (k === "signature") {
      wrap.innerHTML = `
        <div class="space-y-3 text-right">
          <p class="text-sm text-gray-400">חתימת בוחן על הקמת הפרויקט (אופציונלי). הנתונים נשמרים כ־Base64 ב־JSON.</p>
          <div class="relative max-w-full border border-gray-600 rounded-lg bg-white overflow-hidden">
            <canvas id="wizardSignaturePad" class="block w-full touch-none" style="height:10rem" aria-label="שטח חתימה"></canvas>
          </div>
          <button type="button" id="wiz-clear-sig" class="text-sm text-teal-400 hover:underline bg-transparent border-0 cursor-pointer p-0">נקה חתימה</button>
        </div>`;
      setTimeout(() => this.initSignaturePad(), 80);
    }

    btnPrev.disabled = this.currentStep === 0;
    const last = this.currentStep >= total - 1;
    btnNext.classList.toggle("hidden", last);
    btnSave.classList.toggle("hidden", !last);
    if (last) btnSave.textContent = "שמור פרויקט";
  }

  initSignaturePad() {
    const canvas = $("wizardSignaturePad");
    if (!canvas || typeof SignaturePad === "undefined") return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = canvas.parentElement?.clientWidth || 400;
    canvas.width = w * ratio;
    canvas.height = 160 * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    this.sigPad = new SignaturePad(canvas, { minWidth: 0.5, maxWidth: 2.2, penColor: "#0f172a" });
    const clr = $("wiz-clear-sig");
    if (clr) clr.onclick = () => this.sigPad?.clear();
  }

  bindOnce() {
    if (this._bound) return;
    this._bound = true;
    const prev = $("btn-prev");
    const next = $("btn-next");
    const save = $("btn-save");
    const backdrop = $("projectWizardModalBackdrop");
    if (prev)
      prev.onclick = () => {
        this.collectFromDom();
        if (this.currentStep > 0) {
          this.currentStep--;
          this.renderStep();
        }
      };
    if (next)
      next.onclick = () => {
        this.collectFromDom();
        this.softHighlight();
        if (this.currentStep < WIZARD_PROJECT_STEPS.length - 1) {
          this.currentStep++;
          this.renderStep();
        }
      };
    if (save)
      save.onclick = () => {
        void this.submit();
      };
    if (backdrop) backdrop.onclick = () => this.close();
  }

  async submit() {
    this.collectFromDom();
    if (!this.formData.name) {
      showToast("שם פרויקט הוא שדה חובה — חזור לשלב 1.", "warn");
      return;
    }
    const payload = {
      name: this.formData.name,
      clientName: this.formData.clientName,
      address: this.formData.address,
      systemType: this.formData.systemType,
      amperage: this.formData.amperage,
      notes: this.formData.notes,
      tasks: this.formData.tasks,
      signatureBase64: this.formData.signatureBase64 || "",
    };
    try {
      await api("/api/projects/wizard", { method: "POST", body: payload });
      showToast("הפרויקט נשמר בהצלחה.", "ok");
      this.close();
      await loadProjects();
      await refreshPortalData();
    } catch (e) {
      const msg = e?.message || "";
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const netFail =
        offline ||
        /fetch|network|Failed to fetch|רשת|בקשה לקחה/i.test(msg) ||
        /abort/i.test(msg);
      if (netFail) {
        try {
          await enqueueProjectWizardPayload(payload);
          showToast("אין רשת — הנתונים נשמרו במכשיר ויסונכרנו אוטומטית.", "ok");
          this.close();
        } catch (e2) {
          showToast(e2.message || "שגיאת שמירה מקומית", "err");
        }
      } else {
        showToast(msg || "שגיאת שמירה", "err");
      }
    }
  }
}

let projectWizardInst = null;

function setupProjectWizardModal() {
  projectWizardInst = new ProjectWizard();
  window.openProjectWizard = () => projectWizardInst?.open();
  const btn = $("openProjectWizardBtn");
  if (btn) btn.onclick = () => projectWizardInst?.open();
  document.querySelectorAll("[data-portal-tab-jump]").forEach((el) => {
    el.addEventListener("click", () => {
      const tab = el.getAttribute("data-portal-tab-jump");
      if (!tab) return;
      const idx = WIZARD_STEPS.indexOf(tab);
      if (idx >= 0) setWizardStepByIndex(idx);
    });
  });
}

async function syncWizardOutbox() {
  try {
    const before = await countPendingWizard();
    await processPendingWizardQueue((path, opts) => api(path, opts));
    const after = await countPendingWizard();
    if (before > 0 && after === 0) showToast("פרויקטים מהמצב לא מקוון סונכרנו בהצלחה.", "ok");
  } catch (e) {
    console.warn("[syncWizardOutbox]", e);
  }
}

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
    showToast("לא ניתן להכין תצוגת הדפסה. נסה שוב או השתמש בדפדפן אחר.", "err");
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
  n.className = "msg " + (ok ? "msg-ok" : "msg-err");
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {"info"|"ok"|"err"|"warn"} [type]
 * @param {number} [duration] ms
 */
function showToast(message, type = "info", duration = 4500) {
  const container = $("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast" + (type !== "info" ? ` toast-${type}` : "");
  el.textContent = message;
  container.appendChild(el);
  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("toast-show"));
  });
  // Auto-dismiss
  const dismiss = () => {
    el.classList.remove("toast-show");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400); // fallback
  };
  const timer = setTimeout(dismiss, duration);
  el.addEventListener("click", () => { clearTimeout(timer); dismiss(); }, { once: true });
}

/**
 * Async confirm dialog — replaces native confirm().
 * @param {string} message
 * @returns {Promise<boolean>}
 */
function confirmDialog(message) {
  return new Promise((resolve) => {
    const modal = $("confirmModal");
    const msg = $("confirmModalMsg");
    const yesBtn = $("confirmModalYes");
    const noBtn = $("confirmModalNo");
    if (!modal || !yesBtn || !noBtn) { resolve(false); return; }
    if (msg) msg.textContent = message;
    modal.classList.remove("hidden");
    const close = (result) => {
      modal.classList.add("hidden");
      yesBtn.onclick = null;
      noBtn.onclick = null;
      resolve(result);
    };
    yesBtn.onclick = () => close(true);
    noBtn.onclick = () => close(false);
    // Close on Escape
    const onKey = (ev) => {
      if (ev.key === "Escape") { document.removeEventListener("keydown", onKey); close(false); }
    };
    document.addEventListener("keydown", onKey);
    // Focus yes button
    setTimeout(() => yesBtn.focus(), 30);
  });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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

async function readImageFile(file, maxW = 800, maxH = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = String(fr.result || "");
    };
    fr.readAsDataURL(file);
  });
}

function setSection(section) {
  ["home", "about", "contact", "portal"].forEach((s) => {
    const el = $(`section-${s}`);
    if (el) el.classList.toggle("section-hidden", s !== section);
  });
}

function setupDrawer() {
  const drawer = $("drawer");
  const openBtn = $("drawerOpen");
  const closeBtn = $("drawerClose");
  if (!drawer || !openBtn || !closeBtn) return;

  const closeDrawer = () => {
    drawer.classList.add("hidden");
    openBtn.setAttribute("aria-expanded", "false");
  };
  const openDrawer = () => {
    drawer.classList.remove("hidden");
    openBtn.setAttribute("aria-expanded", "true");
    // Focus first focusable element inside drawer
    const firstFocusable = drawer.querySelector("button, a, input");
    if (firstFocusable) firstFocusable.focus();
  };

  openBtn.onclick = openDrawer;
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
    btn.onclick = () => {
      setSection("portal");
      closeDrawer();
    };
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

function renderHomeHeroChips(hc) {
  const wrap = $("homeHeroChips");
  if (!wrap) return;
  const chips = [hc.chip1, hc.chip2, hc.chip3].filter((c) => c && String(c).trim());
  if (chips.length === 0) {
    wrap.innerHTML = "";
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  wrap.innerHTML = chips
    .map((c) => `<span class="home-hero__chip">${escapeHtml(String(c).trim())}</span>`)
    .join("");
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
  setText("heroInspectorName", settings.name || "רובינשטיין חשמל");
  setText("contactName", settings.name || "—");
  setText("contactPhone", settings.phone || "—");
  setText("contactEmail", settings.email || "—");
  setText("homeHeroKickerText", hc.kicker);
  setText("homeHeroTitle", hc.title);
  setText("homeHeroSubtitle", hc.subtitle);
  setText("homePrimaryText", hc.primaryCta);
  setText("whatsappTopText", hc.whatsappCta);
  renderHomeHeroChips(hc);
  setText("homeSectionServicesKicker", hc.sectionServicesKicker);
  setText("homeSectionServicesTitle", hc.sectionServicesTitle);
  setText("homeSectionServicesSub", hc.sectionServicesSub);
  setText("homeSectionGalleryKicker", hc.sectionGalleryKicker);
  setText("homeSectionGalleryTitle", hc.sectionGalleryTitle);
  setText("homeSectionGallerySub", hc.sectionGallerySub);
  setText("homeCtaTitle", hc.ctaTitle);
  setText("homeCtaSubtitle", hc.ctaSubtitle);
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
  const waIds = ["whatsappLink", "whatsappTopLink", "whatsappBannerLink", "whatsappFloatingCta"];
  waIds.forEach((id) => {
    const el = getEl(id);
    if (el) el.href = href;
  });
  // Update about text
  setText("aboutText", settings.aboutText || "");
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
  document.body.classList.toggle("focus-visible-enhanced", !!prefs.focusEnhanced);
  const size = Number(prefs.fontSize || 16);
  document.body.style.setProperty("--base-font-size", `${Math.min(24, Math.max(12, size))}px`);
}

function syncAccessButtonStates(prefs) {
  const btns = document.querySelectorAll("button[data-access]");
  btns.forEach((btn) => {
    const action = btn.dataset.access;
    let active = false;
    if (action === "contrast") active = !!prefs.contrast;
    if (action === "underline-links") active = !!prefs.underlineLinks;
    if (action === "grayscale") active = !!prefs.grayscale;
    if (action === "focus-enhanced") active = !!prefs.focusEnhanced;
    btn.classList.toggle("active", active);
    if (btn.hasAttribute("aria-pressed")) {
      btn.setAttribute("aria-pressed", String(active));
    }
  });
}

function setupAccessibilityToolbar() {
  const toggle = $("accessToggle");
  const panel = $("accessPanel");
  if (!toggle || !panel) return;
  const prefs = readAccessPrefs();
  applyAccessPrefs(prefs);
  syncAccessButtonStates(prefs);

  toggle.onclick = () => {
    const isHidden = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !isHidden);
    toggle.setAttribute("aria-expanded", String(isHidden));
    if (isHidden) {
      // Focus first button in panel
      const firstBtn = panel.querySelector("button");
      if (firstBtn) firstBtn.focus();
    }
  };

  // Close panel when Escape is pressed inside it
  panel.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      panel.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    }
  });

  panel.querySelectorAll("button[data-access]").forEach((btn) => {
    btn.onclick = () => {
      const action = btn.dataset.access;
      const state = readAccessPrefs();
      if (action === "font-plus") state.fontSize = Math.min(24, Number(state.fontSize || 16) + 2);
      if (action === "font-minus") state.fontSize = Math.max(12, Number(state.fontSize || 16) - 2);
      if (action === "contrast") state.contrast = !state.contrast;
      if (action === "underline-links") state.underlineLinks = !state.underlineLinks;
      if (action === "grayscale") state.grayscale = !state.grayscale;
      if (action === "focus-enhanced") state.focusEnhanced = !state.focusEnhanced;
      if (action === "reset") {
        localStorage.removeItem(ACCESS_STORAGE_KEY);
        applyAccessPrefs({});
        syncAccessButtonStates({});
        return;
      }
      writeAccessPrefs(state);
      applyAccessPrefs(state);
      syncAccessButtonStates(state);
    };
  });
}

const WIZARD_LABELS = {
  dashboard: "לוח בקרה",
  projects: "פרויקטים",
  documents: "מסמכים",
  invoices: "חשבוניות",
  quotes: "הצעות מחיר",
  exports: "ייצוא",
  settings: "הגדרות",
};

function setWizardStepByIndex(index) {
  wizardIndex = Math.max(0, Math.min(WIZARD_STEPS.length - 1, index));
  const name = WIZARD_STEPS[wizardIndex];

  document.querySelectorAll(".wizard-step-btn").forEach((btn, i) => {
    const isActive = i === wizardIndex;
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("done", i < wizardIndex);
    btn.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll(".portal-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `portal-${name}`);
  });

  const stepLabel = $("wizardStepLabel");
  if (stepLabel) stepLabel.textContent = WIZARD_LABELS[name] || name;

  const prev = $("wizardPrevBtn");
  if (prev) prev.disabled = wizardIndex === 0;

  const next = $("wizardNextBtn");
  if (next) {
    const isLast = wizardIndex === WIZARD_STEPS.length - 1;
    next.innerHTML = isLast
      ? `סיום <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`
      : `הבא <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
  }
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
  clearToken();
  const gate = $("portalGate");
  const area = $("portalArea");
  if (gate) gate.classList.remove("hidden");
  if (area) area.classList.add("hidden");
  setInputValue("accessCodeInput", "");
}

function setupPortalAuth() {
  const tryLogin = async () => {
    const input = $("accessCodeInput");
    const code = (input?.value || "").trim();
    if (!code) { showMsg("accessMsg", "יש להזין קוד גישה.", false); return; }
    const loginBtn = $("accessLoginBtn");
    if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = "מתחבר…"; }
    try {
      const { token } = await api("/api/auth/login", {
        method: "POST",
        body: { code },
        headers: {}, // no auth header on login
      });
      setToken(token);
      showMsg("accessMsg", "כניסה בוצעה בהצלחה.", true);
      ensurePortalOpen();
      await loadSettings(); // reload with auth token to get blankTemplateData
      await refreshPortalData();
      await syncWizardOutbox();
    } catch (e) {
      showMsg("accessMsg", e.message || "קוד שגוי.", false);
      clearToken();
    } finally {
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = "כניסה"; }
    }
  };

  // Override api() for login — no auth header needed
  const form = $("portalLoginForm");
  if (form) form.addEventListener("submit", (e) => { e.preventDefault(); tryLogin(); });

  const loginBtn = $("accessLoginBtn");
  if (loginBtn) loginBtn.onclick = tryLogin;

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logoutPortal;

  // Auto-restore session if token exists
  if (getToken()) {
    ensurePortalOpen();
  }
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
  if (!payload.title) { showToast("יש להזין שם פרויקט.", "warn"); return; }
  const id = inputTrim("projectId");
  if (id) await api(`/api/projects/${id}`, { method: "PUT", body: payload });
  else await api("/api/projects", { method: "POST", body: payload });
  fillProjectForm(null);
  await loadProjects();
}

async function loadProjects() {
  const res = await api("/api/projects");
  projectCache = res?.items ?? (Array.isArray(res) ? res : []);
  const tbody = $("projectsTable");
  if (!tbody) return;
  tbody.innerHTML = "";
  projectCache.forEach((row) => {
    const statusMap = { planned: "בתכנון", active: "בביצוע", done: "הושלם" };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.clientName || "")}</td>
      <td>${escapeHtml(statusMap[row.status] || row.status || "")}</td>
      <td>${escapeHtml(fmtDate(row.updatedAt))}</td>
      <td style="display:flex;gap:0.35rem;flex-wrap:wrap;">
        <button type="button" class="tbl-btn tbl-btn-edit edit" aria-label="ערוך פרויקט">עריכה</button>
        <button type="button" class="tbl-btn tbl-btn-del del" aria-label="מחק פרויקט">מחיקה</button>
      </td>`;
    tr.querySelector(".edit").onclick = () => fillProjectForm(row);
    tr.querySelector(".del").onclick = async () => {
      if (!await confirmDialog("למחוק את הפרויקט?")) return;
      await api(`/api/projects/${row.id}`, { method: "DELETE" });
      await loadProjects();
    };
    tbody.appendChild(tr);
  });
  refreshDashboardStats();
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

async function downloadServerPdf() {
  const id = inputTrim("docId");
  if (!id) {
    showToast("שמור את המסמך לפני הורדת PDF מהשרת.", "warn");
    return;
  }
  try {
    const blob = await apiBlob(`/api/certificates/${id}/pdf`);
    triggerBlobDownload(blob, `certificate-${id}.pdf`);
    showToast("הקובץ הורד.", "ok");
  } catch (e) {
    showToast(e.message || "שגיאת הורדה", "err");
  }
}

async function shareCurrentDoc() {
  const id = inputTrim("docId");
  if (!id) {
    showToast("שמור את המסמך לפני יצירת קישור שיתוף.", "warn");
    return;
  }
  const raw = window.prompt("משך תוקף בקישור (שעות, 1–720):", "72");
  if (raw === null) return;
  const hours = Math.min(720, Math.max(1, parseInt(raw, 10) || 72));
  try {
    const { url } = await api(`/api/certificates/${id}/share`, {
      method: "POST",
      body: { hoursValid: hours },
    });
    try {
      await navigator.clipboard.writeText(url);
      showToast("הקישור הועתק ללוח.", "ok");
    } catch {
      window.prompt("העתק את קישור השיתוף:", url);
    }
  } catch (e) {
    showToast(e.message || "שגיאה", "err");
  }
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
  const downloadBtn = $("downloadPdfBtn");
  const shareBtn = $("shareDocBtn");
  if (newBtn) newBtn.onclick = () => fillDocForm(null);
  if (saveBtn) saveBtn.onclick = saveDoc;
  if (printBtn) printBtn.onclick = printCurrentDoc;
  if (downloadBtn) downloadBtn.onclick = () => downloadServerPdf();
  if (shareBtn) shareBtn.onclick = () => shareCurrentDoc();
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
  if (!payload.facilityName) { showToast("שם מתקן הוא שדה חובה.", "warn"); return; }
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
  const photosHtml = (doc.photos || [])
    .map(
      (p) =>
        `<div class="rounded-lg overflow-hidden border border-slate-200 shadow-sm"><img src="${p.data}" class="w-full h-44 md:h-52 object-cover" alt="" /></div>`
    )
    .join("");
  const photosBlock = photosHtml
    ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">${photosHtml}</div>`
    : "";
  const decl = String(settings.inspectorDeclarationText || "").trim();
  const declBlock = decl
    ? `<div class="mb-4 text-sm border rounded-lg p-3 bg-slate-50 whitespace-pre-wrap leading-relaxed">${escapeHtml(decl)}</div>`
    : "";
  const sx = Number(settings.stampOffsetXmm || 0);
  const sy = Number(settings.stampOffsetYmm || 0);
  const stampBlock = settings.stampData
    ? `<div class="relative inline-block" style="width:8rem;height:6rem"><img src="${settings.stampData}" alt="" style="position:absolute;right:0;top:0;max-width:120px;max-height:96px;transform:translate(${sx}mm,${sy}mm);transform-origin:top right" /></div>`
    : "";
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
    ${photosBlock}
    ${declBlock}
    <div class="flex justify-between items-end mt-8 gap-4">
      <div>${stampBlock}</div>
      <div class="text-center shrink-0">
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
        ${photosBlock}
        ${declBlock}
        <div class="flex justify-between items-end mt-8 gap-4">
          <div>${stampBlock}</div>
          <div class="text-center shrink-0">
            ${doc.signatureData ? `<img src="${doc.signatureData}" style="height:80px">` : `<div style="height:80px"></div>`}
            <div class="border-t pt-1 text-sm">חתימה וחותמת</div>
          </div>
        </div>
      </div>
    </div>`;
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/tw-built.css" />
  <style>
    .blank-sheet{position:relative;max-width:210mm;min-height:287mm;margin:0 auto;padding:12mm}
    .blank-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0;transform:translate(${Number(settings.blankOffsetXmm || 0)}mm, ${Number(settings.blankOffsetYmm || 0)}mm) scale(${Math.min(1.2, Math.max(0.8, Number(settings.blankScale || 1)))});transform-origin:top right}
    .blank-content{position:relative;z-index:1;padding-top:38mm}
  </style>
  </head><body>
  ${settings.useBlankTemplate && settings.blankTemplateData ? blankLayout : standardLayout}
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
  const res = await api("/api/certificates");
  docsCache = res?.items ?? (Array.isArray(res) ? res : []);
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
      <td style="display:flex;gap:0.35rem;flex-wrap:wrap;">
        <button type="button" class="tbl-btn tbl-btn-edit edit" aria-label="ערוך מסמך">עריכה</button>
        <button type="button" class="tbl-btn tbl-btn-print print" aria-label="הדפס מסמך">הדפסה</button>
        <button type="button" class="tbl-btn tbl-btn-del del" aria-label="מחק מסמך">מחיקה</button>
      </td>`;
    tr.querySelector(".edit").onclick = async () => fillDocForm(await api(`/api/certificates/${row.id}`));
    tr.querySelector(".print").onclick = async () => printDoc(await api(`/api/certificates/${row.id}`));
    tr.querySelector(".del").onclick = async () => {
      if (!await confirmDialog("למחוק את המסמך?")) return;
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
  if (!payload.customerName) { showToast("שם לקוח הוא שדה חובה.", "warn"); return; }
  const p = type === "invoice" ? "inv" : "quo";
  const id = inputTrim(`${p}Id`);
  if (id) await api(`/api/financial-docs/${id}`, { method: "PUT", body: payload });
  else await api("/api/financial-docs", { method: "POST", body: payload });
  fillFinancialForm(type, null);
  await loadFinancial(type);
  refreshDashboardStats();
}

async function loadFinancial(type) {
  const res = await api(`/api/financial-docs?type=${type}`);
  const rows = res?.items ?? (Array.isArray(res) ? res : []);
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
      <td>₪${asMoney(row.totalAmount)}</td>
      <td>${escapeHtml(row.status || "")}</td>
      <td style="display:flex;gap:0.35rem;flex-wrap:wrap;">
        <button type="button" class="tbl-btn tbl-btn-edit edit" aria-label="ערוך ${type === "invoice" ? "חשבונית" : "הצעה"}">עריכה</button>
        <button type="button" class="tbl-btn tbl-btn-del del" aria-label="מחק ${type === "invoice" ? "חשבונית" : "הצעה"}">מחיקה</button>
      </td>`;
    tr.querySelector(".edit").onclick = () => fillFinancialForm(type, row);
    tr.querySelector(".del").onclick = async () => {
      if (!await confirmDialog("למחוק את הרשומה?")) return;
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

function certsThisMonthCount() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return docsCache.filter((d) => {
    if (!d.updatedAt) return false;
    try {
      const t = new Date(d.updatedAt);
      return t.getFullYear() === y && t.getMonth() === m;
    } catch {
      return false;
    }
  }).length;
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

  const active = projectCache.filter((p) => p.status === "active").length;
  const sap = $("stat-active-projects");
  if (sap) sap.textContent = String(active);

  const scm = $("stat-certs-month");
  if (scm) scm.textContent = String(certsThisMonthCount());

  const rev = invoicesCache.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const sr = $("stat-revenue");
  if (sr) sr.textContent = `₪${asMoney(rev)}`;

  const greet = $("dashboard-greeting-name");
  if (greet) greet.textContent = settings.name?.trim() || "בודק";

  renderRecentProjects();
}

function renderRecentProjects() {
  const tbody = $("recent-projects-list");
  if (!tbody) return;
  const rows = [...projectCache].sort((a, b) => {
    const ta = new Date(a.updatedAt || 0).getTime();
    const tb = new Date(b.updatedAt || 0).getTime();
    return tb - ta;
  }).slice(0, 8);
  const statusMap = { planned: "בתכנון", active: "בביצוע", done: "הושלם" };
  tbody.innerHTML = rows
    .map(
      (row) => `
    <tr>
      <td class="p-4">${escapeHtml(row.title)}</td>
      <td class="p-4">${escapeHtml(row.clientName || "")}</td>
      <td class="p-4">${escapeHtml(statusMap[row.status] || row.status || "")}</td>
      <td class="p-4 whitespace-nowrap">${escapeHtml(fmtDate(row.updatedAt))}</td>
    </tr>`
    )
    .join("");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-500">אין פרויקטים עדיין — לחץ &quot;פרויקט חדש&quot;.</td></tr>`;
  }
}

async function loadSettings() {
  mergeServerSettings(await api("/api/settings"));
  renderHomeFromSettings();
  setInputValue("setName", settings.name || "");
  setInputValue("setLicense", settings.licenseNo || "");
  setInputValue("setPhone", settings.phone || "");
  setInputValue("setEmail", settings.email || "");
  setInputValue("setWhatsapp", settings.whatsapp || "");
  setInputValue("setAccessCode", "");
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
  setInputValue("setHomeSectionServicesKicker", hc.sectionServicesKicker);
  setInputValue("setHomeSectionServicesTitle", hc.sectionServicesTitle);
  setInputValue("setHomeSectionServicesSub", hc.sectionServicesSub);
  setInputValue("setHomeSectionGalleryKicker", hc.sectionGalleryKicker);
  setInputValue("setHomeSectionGalleryTitle", hc.sectionGalleryTitle);
  setInputValue("setHomeSectionGallerySub", hc.sectionGallerySub);
  setInputValue("setHomeCtaTitle", hc.ctaTitle);
  setInputValue("setHomeCtaSubtitle", hc.ctaSubtitle);
  setChecked("setUseBlankTemplate", !!settings.useBlankTemplate);
  setInputValue("setBlankOffsetX", String(Number(settings.blankOffsetXmm || 0)));
  setInputValue("setBlankOffsetY", String(Number(settings.blankOffsetYmm || 0)));
  setInputValue("setBlankScale", String(Number(settings.blankScale || 1)));
  setInputValue("setInspectorDeclaration", settings.inspectorDeclarationText || "");
  setInputValue("setStampOffsetX", String(Number(settings.stampOffsetXmm || 0)));
  setInputValue("setStampOffsetY", String(Number(settings.stampOffsetYmm || 0)));
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
      settings.blankTemplateData = await readImageFile(f, 1240, 1754, 0.82);
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
        sectionServicesKicker: inputTrim("setHomeSectionServicesKicker"),
        sectionServicesTitle: inputTrim("setHomeSectionServicesTitle"),
        sectionServicesSub: inputTrim("setHomeSectionServicesSub"),
        sectionGalleryKicker: inputTrim("setHomeSectionGalleryKicker"),
        sectionGalleryTitle: inputTrim("setHomeSectionGalleryTitle"),
        sectionGallerySub: inputTrim("setHomeSectionGallerySub"),
        ctaTitle: inputTrim("setHomeCtaTitle"),
        ctaSubtitle: inputTrim("setHomeCtaSubtitle"),
      };
      const blankTpl = $("setUseBlankTemplate");
      settings.useBlankTemplate = !!blankTpl?.checked;
      settings.blankOffsetXmm = Number(inputRaw("setBlankOffsetX") || 0);
      settings.blankOffsetYmm = Number(inputRaw("setBlankOffsetY") || 0);
      settings.blankScale = Number(inputRaw("setBlankScale") || 1);
      settings.inspectorDeclarationText = inputTrim("setInspectorDeclaration");
      settings.stampOffsetXmm = Number(inputRaw("setStampOffsetX") || 0);
      settings.stampOffsetYmm = Number(inputRaw("setStampOffsetY") || 0);
      mergeServerSettings(await api("/api/settings", { method: "PUT", body: settings }));
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
  window.addEventListener("ecs-unauthorized", () => {
    logoutPortal();
  });
  setupDrawer();
  setupHomeShowcase();
  setupAccessibilityToolbar();
  setupPortalWizard();
  setupProjectWizardModal();
  setupPortalAuth();
  window.addEventListener("online", () => {
    void syncWizardOutbox();
  });
  bindProjectForm();
  await bindDocForm();
  initDocSignature();
  renderFinancialForm("invoice");
  renderFinancialForm("quote");
  bindSettingsForm();
  setupExport();
  setupPwaInstall();
  registerServiceWorker();
  document.body.classList.add("settings-loading");
  setSection("home");

  try {
    await api("/api/health");
  } catch (e) {
    console.error(e);
    showToast(`שגיאת חיבור לשרת: ${e.message}`, "err", 8000);
    return;
  }
  try {
    await loadSettings();
    document.body.classList.remove("settings-loading");
  } catch (e) {
    document.body.classList.remove("settings-loading");
    console.error(e);
    showToast(`שגיאה בטעינת הגדרות: ${e.message}`, "err", 8000);
    return;
  }
  try {
    fillProjectForm(null);
    fillDocForm(null);
    fillFinancialForm("invoice", null);
    fillFinancialForm("quote", null);
  } catch (e) {
    console.error(e);
    showToast(`שגיאה באתחול טפסים: ${e.message}`, "err");
  }

  // Auto-restore: if a valid token was found on startup, load portal data now
  if (isPortalOpen) {
    try {
      await refreshPortalData();
      await syncWizardOutbox();
    } catch (e) {
      // Token may be expired — force logout
      console.warn("[auto-login] could not load portal data:", e.message);
      logoutPortal();
    }
  }
});
