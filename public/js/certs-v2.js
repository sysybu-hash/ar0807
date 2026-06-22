/**
 * חלון אישורים חדש (בטא) — שלבים, באנר בלאנק, מגירת רשימה במובייל
 */

import { STR } from "./cert-strings.js";
import { CERT_TYPES } from "./cert-types.js";

const STEPS = ["general", "details", "checks", "signature"];

export function initCertsV2(workspace, { getSettings, onOpenSettings, onAfterSave } = {}) {
  if (!workspace) return;

  const origSave = workspace.saveDoc.bind(workspace);
  workspace.saveDoc = async () => {
    await origSave();
    if (onAfterSave) await onAfterSave();
  };

  let currentStep = 0;

  function updateBlankBanner() {
    const banner = document.getElementById("v2BlankBanner");
    if (!banner) return;
    const s = getSettings?.() || {};
    const active = s.useBlankTemplate && s.blankTemplateData;
    banner.classList.toggle("hidden", !active);
  }

  function updateStats() {
    const el = document.getElementById("v2CertStats");
    if (!el) return;
    const { draft, final, total } = workspace.statsThisMonth();
    el.textContent = `החודש: ${total} (${final} סופי · ${draft} טיוטה)`;
  }

  function showStep(idx) {
    currentStep = Math.max(0, Math.min(STEPS.length - 1, idx));
    document.querySelectorAll(".certs-v2__step-panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.stepPanel !== STEPS[currentStep]);
    });
    document.querySelectorAll(".certs-v2__step-btn").forEach((btn, i) => {
      btn.classList.toggle("is-active", i === currentStep);
      btn.setAttribute("aria-selected", String(i === currentStep));
    });
  }

  function bindSteps() {
    document.querySelectorAll(".certs-v2__step-btn").forEach((btn, i) => {
      btn.addEventListener("click", () => showStep(i));
    });
    const prev = document.getElementById("v2StepPrev");
    const next = document.getElementById("v2StepNext");
    if (prev) prev.addEventListener("click", () => showStep(currentStep - 1));
    if (next) next.addEventListener("click", () => showStep(currentStep + 1));
  }

  function bindMobileList() {
    const toggle = document.getElementById("v2ListToggle");
    const drawer = document.getElementById("v2ListDrawer");
    const backdrop = document.getElementById("v2ListBackdrop");
    const close = () => {
      drawer?.classList.remove("is-open");
      backdrop?.classList.remove("is-open");
      document.body.classList.remove("certs-v2-list-open");
    };
    toggle?.addEventListener("click", () => {
      drawer?.classList.add("is-open");
      backdrop?.classList.add("is-open");
      document.body.classList.add("certs-v2-list-open");
    });
    backdrop?.addEventListener("click", close);
    document.getElementById("v2ListClose")?.addEventListener("click", close);
  }

  function bindBlankSettings() {
    document.getElementById("v2BlankSettingsBtn")?.addEventListener("click", () => {
      onOpenSettings?.();
    });
  }

  const origRender = workspace.renderDocsList.bind(workspace);
  workspace.renderDocsList = () => {
    origRender();
    updateStats();
  };

  bindSteps();
  bindMobileList();
  bindBlankSettings();
  showStep(0);
  updateBlankBanner();

  void workspace.bindDocForm().then(() => {
    workspace.initDocSignature();
    workspace.fillDocForm(null);
    updateStats();
  });

  document.getElementById("portal-documents-v2")?.addEventListener("transitionend", updateBlankBanner);

  return {
    refreshUi: () => {
      updateBlankBanner();
      updateStats();
    },
    certTypes: CERT_TYPES,
    strings: STR,
  };
}
