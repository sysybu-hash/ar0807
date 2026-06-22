/* global SignaturePad */
/**
 * לוגיקה משותפת לאישורי תקינות — חלון ישן וחדש
 */

import {
  certTypeLabel,
  certTypeShortLabel,
  defaultPortableApplianceRow,
  defaultEvChecks,
  defaultEvPeriodicTests,
  defaultTechRows,
  defaultVisualChecklist,
} from "./cert-types.js";
import { buildPrintDocHtml, escapeHtml } from "./certs-print.js";
import { STR } from "./cert-strings.js";

export class CertWorkspace {
  /**
   * @param {object} opts
   * @param {string} [opts.prefix] — "" ל-v1, "v2" לחלון חדש
   * @param {Function} opts.api
   * @param {Function} opts.apiBlob
   * @param {() => object} opts.getSettings
   * @param {(msg: string, kind?: string) => void} opts.showToast
   * @param {() => void} [opts.refreshDashboardStats]
   * @param {(msg: string) => Promise<boolean>} opts.confirmDialog
   * @param {(file: File) => Promise<string>} opts.readImageFile
   * @param {(iso: string) => string} opts.fmtDate
   * @param {(iso: string) => string} opts.fmtDateShort
   * @param {(html: string) => void} opts.openPrintableHtml
   * @param {(opts: object) => void} opts.openDocPreviewModal
   * @param {() => void} [opts.closeDocPreviewModal]
   * @param {(blob: Blob, filename: string) => void} [opts.openBlobPdf]
   * @param {() => boolean} [opts.isMobile]
   * @param {(doc: object) => void} [opts.onEditDoc]
   * @param {(blob: Blob, name: string) => void} opts.downloadBlob
   * @param {string} [opts.editorScrollSelector]
   * @param {string} [opts.listContainerId] — מזהה רשימה (טבלה או div)
   * @param {"table"|"cards"} [opts.listMode]
   */
  constructor(opts) {
    this.prefix = opts.prefix || "";
    this.api = opts.api;
    this.apiBlob = opts.apiBlob;
    this.getSettings = opts.getSettings;
    this.showToast = opts.showToast;
    this.refreshDashboardStats = opts.refreshDashboardStats || (() => {});
    this.confirmDialog = opts.confirmDialog;
    this.readImageFile = opts.readImageFile;
    this.fmtDate = opts.fmtDate;
    this.fmtDateShort = opts.fmtDateShort;
    this.openPrintableHtml = opts.openPrintableHtml;
    this.openDocPreviewModal = opts.openDocPreviewModal;
    this.closeDocPreviewModal = opts.closeDocPreviewModal || (() => {});
    this.openBlobPdf = opts.openBlobPdf || ((blob, name) => this.downloadBlob(blob, name));
    this.isMobile = opts.isMobile || (() => false);
    this.onEditDoc = opts.onEditDoc;
    this.downloadBlob = opts.downloadBlob;
    this.editorScrollSelector = opts.editorScrollSelector || ".cert-page__editor";
    this.listContainerId = opts.listContainerId || "docsTable";
    this.listMode = opts.listMode || "table";

    this.docsCache = [];
    this.docPhotos = [];
    this.docSignaturePad = null;
    this.portableAppliances = [];
    this.techRowsState = defaultTechRows().map((r) => ({ ...r }));
    this.visualChecklistState = defaultVisualChecklist().slice();
    this.evChecksState = defaultEvChecks();
    this.evPeriodicState = defaultEvPeriodicTests();
  }

  fid(base) {
    if (!this.prefix) return base;
    return this.prefix + base.charAt(0).toUpperCase() + base.slice(1);
  }

  $(id) {
    return document.getElementById(this.fid(id));
  }

  inputTrim(id) {
    const el = this.$(id);
    if (!el) return "";
    return String(el.value || "").trim();
  }

  inputRaw(id) {
    const el = this.$(id);
    if (!el) return "";
    return String(el.value || "");
  }

  setInputValue(id, value) {
    const el = this.$(id);
    if (!el) return;
    el.value = value ?? "";
  }

  async loadDocs() {
    const res = await this.api("/api/certificates");
    this.docsCache = res?.items ?? (Array.isArray(res) ? res : []);
    this.renderDocsList();
  }

  filteredDocs() {
    const q = (this.inputTrim("docsSearchInput") || "").toLowerCase();
    const typeF = this.inputRaw("docsTypeFilter") || "";
    const statusF = this.inputRaw("docsStatusFilter") || "";
    return this.docsCache.filter((row) => {
      if (typeF && row.docType !== typeF) return false;
      const st = row.workflowStatus || "draft";
      if (statusF && st !== statusF) return false;
      if (!q) return true;
      const hay = `${row.facilityName || ""} ${row.address || ""} ${row.id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  onDocTypeChange() {
    const t = this.inputRaw("docType") || "installation";
    const inst = this.$("docFieldsInstallation");
    const port = this.$("docFieldsPortable");
    const ev = this.$("docFieldsEvCharging");
    if (inst) inst.classList.toggle("hidden", t !== "installation");
    if (port) port.classList.toggle("hidden", t !== "portable");
    if (ev) ev.classList.toggle("hidden", t !== "ev_charging");
    const root = this.$("docForm")?.closest(".certs-v2, .cert-page");
    root?.querySelectorAll("[data-cert-type-card]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.certTypeCard === t);
    });
  }

  setDocType(type) {
    this.setInputValue("docType", type);
    this.onDocTypeChange();
  }

  renderTechRowsTable() {
    const tbody = this.$("docTechRows");
    if (!tbody) return;
    tbody.innerHTML = "";
    this.techRowsState.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="inp inp-compact" data-tech-field="description" data-idx="${idx}" value="${escapeHtml(row.description || "")}" /></td>
        <td><input class="inp inp-compact" data-tech-field="result" data-idx="${idx}" value="${escapeHtml(row.result || "")}" /></td>
        <td><button type="button" class="tbl-btn tbl-btn-del" data-tech-del="${idx}" aria-label="מחק שורה">×</button></td>`;
      tr.querySelectorAll("input[data-tech-field]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const i = Number(inp.dataset.idx);
          const f = inp.dataset.techField;
          if (this.techRowsState[i]) this.techRowsState[i][f] = inp.value;
        });
      });
      tr.querySelector("[data-tech-del]")?.addEventListener("click", () => {
        this.techRowsState.splice(idx, 1);
        this.renderTechRowsTable();
      });
      tbody.appendChild(tr);
    });
  }

  renderVisualChecklistTable() {
    const tbody = this.$("docVisualRows");
    if (!tbody) return;
    tbody.innerHTML = "";
    this.visualChecklistState.forEach((text, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="inp inp-compact" data-visual-idx="${idx}" value="${escapeHtml(text || "")}" /></td>
        <td><button type="button" class="tbl-btn tbl-btn-del" data-visual-del="${idx}" aria-label="מחק פריט">×</button></td>`;
      tr.querySelector("input")?.addEventListener("input", (e) => {
        this.visualChecklistState[idx] = e.target.value;
      });
      tr.querySelector("[data-visual-del]")?.addEventListener("click", () => {
        this.visualChecklistState.splice(idx, 1);
        this.renderVisualChecklistTable();
      });
      tbody.appendChild(tr);
    });
  }

  renderPortableAppliancesTable() {
    const tbody = this.$("docPortableAppliances");
    if (!tbody) return;
    tbody.innerHTML = "";
    this.portableAppliances.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="inp inp-compact" data-field="assetId" data-idx="${idx}" value="${escapeHtml(row.assetId || "")}" /></td>
        <td><input class="inp inp-compact" data-field="description" data-idx="${idx}" value="${escapeHtml(row.description || "")}" /></td>
        <td><input class="inp inp-compact" data-field="location" data-idx="${idx}" value="${escapeHtml(row.location || "")}" /></td>
        <td><input class="inp inp-compact" data-field="visualOk" data-idx="${idx}" value="${escapeHtml(row.visualOk || "")}" /></td>
        <td><input class="inp inp-compact" data-field="earthContinuity" data-idx="${idx}" value="${escapeHtml(row.earthContinuity || "")}" /></td>
        <td><input class="inp inp-compact" data-field="insulation" data-idx="${idx}" value="${escapeHtml(row.insulation || "")}" /></td>
        <td><input class="inp inp-compact" data-field="leakage" data-idx="${idx}" value="${escapeHtml(row.leakage || "")}" /></td>
        <td><input class="inp inp-compact" data-field="result" data-idx="${idx}" value="${escapeHtml(row.result || "")}" /></td>
        <td><input class="inp inp-compact" type="date" data-field="nextTestDate" data-idx="${idx}" value="${escapeHtml(row.nextTestDate || "")}" /></td>
        <td><button type="button" class="tbl-btn tbl-btn-del" data-del="${idx}" aria-label="מחק שורה">×</button></td>`;
      tr.querySelectorAll("input[data-field]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const i = Number(inp.dataset.idx);
          const f = inp.dataset.field;
          if (this.portableAppliances[i]) this.portableAppliances[i][f] = inp.value;
        });
      });
      tr.querySelector("[data-del]")?.addEventListener("click", () => {
        this.portableAppliances.splice(idx, 1);
        this.renderPortableAppliancesTable();
      });
      tbody.appendChild(tr);
    });
  }

  renderEvChecksForm() {
    const wrap = this.$("docEvChecks");
    if (!wrap) return;
    wrap.innerHTML = "";
    this.evChecksState.forEach((c, idx) => {
      const row = document.createElement("div");
      row.className = "ev-check-row";
      row.innerHTML = `
        <span class="ev-check-row__label">${escapeHtml(c.item)}</span>
        <select class="inp select inp-compact" data-ev-check="${idx}">
          <option value="תקין" ${c.result === "תקין" ? "selected" : ""}>תקין</option>
          <option value="לא תקין" ${c.result === "לא תקין" ? "selected" : ""}>לא תקין</option>
          <option value="—" ${c.result === "—" ? "selected" : ""}>—</option>
        </select>`;
      row.querySelector("select")?.addEventListener("change", (e) => {
        this.evChecksState[idx].result = e.target.value;
      });
      wrap.appendChild(row);
    });
  }

  renderEvPeriodicForm() {
    const tbody = this.$("docEvPeriodic");
    if (!tbody) return;
    tbody.innerHTML = "";
    this.evPeriodicState.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(p.test)}</td>
        <td>${escapeHtml(p.frequency)}</td>
        <td><input class="inp inp-compact" type="date" data-ev-date="${idx}" value="${escapeHtml(p.lastDate || "")}" /></td>
        <td><input class="inp inp-compact" data-ev-result="${idx}" value="${escapeHtml(p.result || "")}" /></td>`;
      tr.querySelector("[data-ev-date]")?.addEventListener("input", (e) => {
        this.evPeriodicState[idx].lastDate = e.target.value;
      });
      tr.querySelector("[data-ev-result]")?.addEventListener("input", (e) => {
        this.evPeriodicState[idx].result = e.target.value;
      });
      tbody.appendChild(tr);
    });
  }

  renderDocPhotos() {
    const wrap = this.$("docPhotosPreview");
    if (!wrap) return;
    wrap.innerHTML = "";
    this.docPhotos.forEach((p, i) => {
      const div = document.createElement("div");
      div.className = "photo-thumb";
      div.innerHTML = `<img src="${p.data}" alt=""><button type="button" class="photo-thumb__del" aria-label="הסר תמונה">×</button>`;
      div.querySelector("button")?.addEventListener("click", () => {
        this.docPhotos.splice(i, 1);
        this.renderDocPhotos();
      });
      wrap.appendChild(div);
    });
  }

  fillDocForm(doc) {
    const titleEl = this.$("docEditorTitle");
    if (titleEl) {
      titleEl.textContent = doc?.id
        ? `עריכה — ${certTypeLabel(doc.docType)}${doc.facilityName ? `: ${doc.facilityName}` : ""}`
        : STR.newDoc;
    }
    this.setInputValue("docId", doc ? String(doc.id) : "");
    this.setInputValue("docType", doc?.docType || "installation");
    const ex = doc?.extra && typeof doc.extra === "object" ? doc.extra : {};
    this.setInputValue("docNo", ex.docNo || doc?.docNo || "");
    this.setInputValue("docWorkflowStatus", ex.workflowStatus || "draft");
    this.setInputValue("docFacilityName", doc?.facilityName || "");
    this.setInputValue("docAddress", doc?.address || "");
    this.setInputValue("docInspectionDate", ex.inspectionDate || "");
    this.setInputValue("docNotes", doc?.notes || "");
    this.setInputValue("docClientName", ex.clientName || "");
    this.setInputValue("docInstallationType", ex.installationType || "");
    this.setInputValue("docInspectionPurpose", ex.inspectionPurpose || "מתקן חדש");
    this.setInputValue("docConnection", doc?.connectionSize || ex.connectionExisting || "");
    this.setInputValue("docConnectionRequested", ex.connectionRequested || "");
    this.setInputValue("docGrounding", doc?.groundingValue || "");
    this.setInputValue("docInsulation", doc?.insulation || "");
    this.setInputValue("docPanelMeterNo", ex.panelMeterNo || "");
    this.setInputValue("docFinalStatus", ex.finalStatusBanner || "");
    this.techRowsState =
      Array.isArray(ex.techInspection) && ex.techInspection.length
        ? ex.techInspection.map((r) => ({ description: r.description || "", result: r.result ?? "—" }))
        : defaultTechRows().map((r) => ({ ...r }));
    this.visualChecklistState =
      Array.isArray(ex.visualChecklist) && ex.visualChecklist.length
        ? ex.visualChecklist.map((s) => (typeof s === "string" ? s : String(s)))
        : defaultVisualChecklist().slice();
    this.setInputValue("docPortableEmployer", ex.employerName || "");
    this.setInputValue("docPortableMarking", ex.markingMethod || STR.defaultMarking);
    this.setInputValue("docPortableSummary", ex.summary || "");
    this.portableAppliances =
      Array.isArray(ex.appliances) && ex.appliances.length
        ? ex.appliances.map((a) => ({ ...defaultPortableApplianceRow(), ...a }))
        : [];
    this.setInputValue("docEvOwner", ex.ownerName || "");
    this.setInputValue("docEvSiteKind", ex.siteKind || "פרטי");
    this.setInputValue("docEvManufacturer", ex.stationManufacturer || "");
    this.setInputValue("docEvModel", ex.stationModel || "");
    this.setInputValue("docEvSerial", ex.stationSerial || "");
    this.setInputValue("docEvPowerKw", ex.stationPowerKw || "");
    this.setInputValue("docEvChargeType", ex.chargeType || "AC");
    this.setInputValue("docEvConnector", ex.connectorType || "");
    this.setInputValue("docEvImporterRef", ex.importerDeclarationRef || "");
    this.setInputValue("docEvImporterDate", ex.importerDeclarationDate || "");
    this.setInputValue("docEvInstallerName", ex.installerName || "");
    this.setInputValue("docEvInstallerLicense", ex.installerLicense || "");
    this.setInputValue("docEvGrounding", doc?.groundingValue || ex.groundingValue || "");
    this.setInputValue("docEvGridBanner", ex.gridApprovalBanner || "");
    this.evChecksState =
      Array.isArray(ex.checks) && ex.checks.length
        ? ex.checks.map((c, i) => ({
            ...(defaultEvChecks()[i] || { item: c.item, result: "תקין" }),
            ...c,
          }))
        : defaultEvChecks();
    this.evPeriodicState =
      Array.isArray(ex.periodicTests) && ex.periodicTests.length
        ? ex.periodicTests.map((p, i) => ({ ...(defaultEvPeriodicTests()[i] || {}), ...p }))
        : defaultEvPeriodicTests();
    this.renderTechRowsTable();
    this.renderVisualChecklistTable();
    this.renderPortableAppliancesTable();
    this.renderEvChecksForm();
    this.renderEvPeriodicForm();
    this.onDocTypeChange();
    this.docPhotos = doc?.photos ? doc.photos.slice() : [];
    this.renderDocPhotos();
    if (this.docSignaturePad) {
      this.docSignaturePad.clear();
      if (doc?.signatureData) this.docSignaturePad.fromDataURL(doc.signatureData);
    }
    if (doc?.id) {
      this.onEditDoc?.(doc);
      document.querySelector(this.editorScrollSelector)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  buildDocPayload() {
    const docType = this.inputRaw("docType") || "installation";
    const extra = {
      docNo: this.inputTrim("docNo"),
      workflowStatus: this.inputRaw("docWorkflowStatus") || "draft",
      inspectionDate: this.inputRaw("docInspectionDate"),
    };
    if (docType === "installation") {
      Object.assign(extra, {
        clientName: this.inputTrim("docClientName"),
        installationType: this.inputTrim("docInstallationType"),
        inspectionPurpose: this.inputRaw("docInspectionPurpose"),
        connectionExisting: this.inputTrim("docConnection"),
        connectionRequested: this.inputTrim("docConnectionRequested"),
        panelMeterNo: this.inputTrim("docPanelMeterNo"),
        finalStatusBanner: this.inputTrim("docFinalStatus"),
        techInspection: this.techRowsState.map((r) => ({
          description: r.description || "",
          result: r.result || "—",
        })),
        visualChecklist: this.visualChecklistState.map((s) => String(s).trim()).filter(Boolean),
      });
    } else if (docType === "portable") {
      Object.assign(extra, {
        employerName: this.inputTrim("docPortableEmployer"),
        markingMethod: this.inputTrim("docPortableMarking") || STR.defaultMarking,
        summary: this.inputTrim("docPortableSummary"),
        appliances: this.portableAppliances.slice(0, 50),
      });
    } else if (docType === "ev_charging") {
      Object.assign(extra, {
        ownerName: this.inputTrim("docEvOwner"),
        siteKind: this.inputRaw("docEvSiteKind"),
        stationManufacturer: this.inputTrim("docEvManufacturer"),
        stationModel: this.inputTrim("docEvModel"),
        stationSerial: this.inputTrim("docEvSerial"),
        stationPowerKw: this.inputTrim("docEvPowerKw"),
        chargeType: this.inputRaw("docEvChargeType"),
        connectorType: this.inputTrim("docEvConnector"),
        importerDeclarationRef: this.inputTrim("docEvImporterRef"),
        importerDeclarationDate: this.inputRaw("docEvImporterDate"),
        installerName: this.inputTrim("docEvInstallerName"),
        installerLicense: this.inputTrim("docEvInstallerLicense"),
        gridApprovalBanner: this.inputTrim("docEvGridBanner"),
        checks: this.evChecksState.slice(),
        periodicTests: this.evPeriodicState.slice(),
      });
    }
    const grounding =
      docType === "ev_charging" ? this.inputTrim("docEvGrounding") : this.inputTrim("docGrounding");
    return {
      docType,
      facilityName: this.inputTrim("docFacilityName"),
      address: this.inputTrim("docAddress"),
      connectionSize: docType === "installation" ? this.inputTrim("docConnection") : "",
      groundingValue: grounding,
      insulation: docType === "installation" ? this.inputTrim("docInsulation") : "",
      notes: this.inputTrim("docNotes"),
      photos: this.docPhotos,
      extra,
      signatureData:
        this.docSignaturePad && !this.docSignaturePad.isEmpty()
          ? this.docSignaturePad.toDataURL("image/png")
          : null,
    };
  }

  async saveDoc() {
    let payload;
    try {
      payload = this.buildDocPayload();
    } catch (e) {
      this.showToast(e.message || "שגיאת נתונים", "warn");
      return;
    }
    if (!payload.facilityName) {
      this.showToast(STR.facilityRequired, "warn");
      return;
    }
    const id = this.inputTrim("docId");
    if (id) await this.api(`/api/certificates/${id}`, { method: "PUT", body: payload });
    else {
      const created = await this.api("/api/certificates", { method: "POST", body: payload });
      this.setInputValue("docId", String(created.id));
    }
    await this.loadDocs();
    this.refreshDashboardStats();
  }

  buildPrintHtml(doc, autoPrint = false) {
    return buildPrintDocHtml(doc, this.getSettings(), {
      autoPrint,
      fmtDate: this.fmtDate,
    });
  }

  async printDoc(doc) {
    if (!doc?.id) {
      this.showToast(STR.saveBeforePdf, "warn");
      return;
    }
    try {
      const blob = await this.apiBlob(`/api/certificates/${doc.id}/pdf`);
      this.openBlobPdf(blob, `certificate-${doc.id}.pdf`);
    } catch (e) {
      this.showToast(e.message || "שגיאת הדפסה", "err");
    }
  }

  async previewCertificateDoc(doc) {
    const title = certTypeLabel(doc.docType);
    const docId = doc.id != null ? String(doc.id) : "";
    try {
      if (docId) {
        const blob = await this.apiBlob(`/api/certificates/${docId}/pdf`);
        if (this.isMobile()) {
          this.openBlobPdf(blob, `certificate-${docId}.pdf`);
          return;
        }
        this.openDocPreviewModal({ title, pdfBlob: blob });
        return;
      }
      this.openDocPreviewModal({
        title: `${title} (טיוטה)`,
        html: this.buildPrintHtml(doc, false),
        hint: STR.previewDraftHint,
      });
    } catch (e) {
      this.showToast(e.message || "לא ניתן לטעון תצוגה מקדימה", "err");
    }
  }

  async previewCurrentDoc() {
    const id = this.inputTrim("docId");
    if (id) {
      await this.previewCertificateDoc(await this.api(`/api/certificates/${id}`));
      return;
    }
    try {
      const doc = {
        ...this.buildDocPayload(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.previewCertificateDoc(doc);
    } catch (e) {
      this.showToast(e.message || "שגיאת נתונים", "warn");
    }
  }

  async printCurrentDoc() {
    const id = this.inputTrim("docId");
    if (id) {
      const doc = await this.api(`/api/certificates/${id}`);
      this.printDoc(doc);
    } else {
      this.printDoc({ ...this.buildDocPayload(), createdAt: new Date().toISOString() });
    }
  }

  async downloadServerPdf() {
    const id = this.inputTrim("docId");
    if (!id) {
      this.showToast(STR.saveBeforePdf, "warn");
      return;
    }
    try {
      const blob = await this.apiBlob(`/api/certificates/${id}/pdf`);
      this.downloadBlob(blob, `certificate-${id}.pdf`);
      this.showToast(STR.downloaded, "ok");
    } catch (e) {
      this.showToast(e.message || "שגיאת הורדה", "err");
    }
  }

  async shareCurrentDoc() {
    const id = this.inputTrim("docId");
    if (!id) {
      this.showToast(STR.saveBeforeShare, "warn");
      return;
    }
    const raw = window.prompt("משך תוקף בקישור (שעות, 1–720):", "72");
    if (raw === null) return;
    const hours = Math.min(720, Math.max(1, parseInt(raw, 10) || 72));
    try {
      const { url } = await this.api(`/api/certificates/${id}/share`, {
        method: "POST",
        body: { hoursValid: hours },
      });
      try {
        await navigator.clipboard.writeText(url);
        this.showToast(STR.shareCopied, "ok");
      } catch {
        window.prompt("העתק את קישור השיתוף:", url);
      }
    } catch (e) {
      this.showToast(e.message || "שגיאה", "err");
    }
  }

  bindDocRowActions(row, trOrCard) {
    const editBtn = trOrCard.querySelector(".edit");
    const previewBtn = trOrCard.querySelector(".preview");
    const printBtn = trOrCard.querySelector(".print");
    const delBtn = trOrCard.querySelector(".del");
    if (editBtn) {
      editBtn.onclick = async () => {
        this.closeDocPreviewModal();
        await this.fillDocForm(await this.api(`/api/certificates/${row.id}`));
      };
    }
    if (previewBtn) {
      previewBtn.onclick = async () =>
        this.previewCertificateDoc(await this.api(`/api/certificates/${row.id}`));
    }
    if (printBtn) {
      printBtn.onclick = async () => this.printDoc(await this.api(`/api/certificates/${row.id}`));
    }
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!(await this.confirmDialog(STR.deleteConfirm))) return;
        await this.api(`/api/certificates/${row.id}`, { method: "DELETE" });
        await this.loadDocs();
        this.refreshDashboardStats();
      };
    }
  }

  renderDocsTable() {
    const tbody = document.getElementById(this.listContainerId);
    if (!tbody || this.listMode !== "table") return;
    tbody.innerHTML = "";
    const rows = this.filteredDocs();
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">${STR.emptyList}</td></tr>`;
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const isFinal = row.workflowStatus === "final";
      const stLabel = isFinal ? STR.statusFinal : STR.statusDraft;
      const badgeClass = isFinal ? "badge--final" : "badge--draft";
      tr.innerHTML = `
        <td data-label="">
          <div class="doc-list-actions">
            <button type="button" class="tbl-btn tbl-btn-edit edit" aria-label="ערוך">${STR.editDoc}</button>
            <button type="button" class="tbl-btn tbl-btn-edit preview" aria-label="תצוגה">${STR.viewDoc}</button>
            <button type="button" class="tbl-btn tbl-btn-print print" aria-label="הדפס">${STR.printDoc}</button>
            <button type="button" class="tbl-btn tbl-btn-del del" aria-label="מחק">${STR.deleteDoc}</button>
          </div>
        </td>
        <td data-label="עודכן" class="text-nowrap doc-list-date">${escapeHtml(this.fmtDateShort(row.updatedAt))}</td>
        <td data-label="סטטוס"><span class="badge ${badgeClass}">${escapeHtml(stLabel)}</span></td>
        <td data-label="שם מתקן" class="doc-list-name">${escapeHtml(row.facilityName || "—")}</td>
        <td data-label="סוג"><span class="doc-list-type" title="${escapeHtml(certTypeLabel(row.docType))}">${escapeHtml(certTypeShortLabel(row.docType))}</span></td>`;
      this.bindDocRowActions(row, tr);
      tbody.appendChild(tr);
    });
  }

  renderDocsCards() {
    const wrap = document.getElementById(this.listContainerId);
    const mobile = document.getElementById("v2DocsListMobile");
    const targets = [wrap, mobile].filter(Boolean);
    if (!targets.length || this.listMode !== "cards") return;
    const rows = this.filteredDocs();
    const htmlEmpty = `<p class="certs-v2__empty">${STR.emptyList}</p>`;
    if (rows.length === 0) {
      targets.forEach((t) => {
        t.innerHTML = htmlEmpty;
      });
      return;
    }
    targets.forEach((target) => {
      target.innerHTML = "";
      rows.forEach((row) => {
        const isFinal = row.workflowStatus === "final";
        const stLabel = isFinal ? STR.statusFinal : STR.statusDraft;
        const card = document.createElement("article");
        card.className = "certs-v2-doc-card";
        card.innerHTML = `
        <div class="certs-v2-doc-card__head">
          <span class="certs-v2-doc-card__type">${escapeHtml(certTypeShortLabel(row.docType))}</span>
          <span class="badge ${isFinal ? "badge--final" : "badge--draft"}">${escapeHtml(stLabel)}</span>
        </div>
        <h4 class="certs-v2-doc-card__name">${escapeHtml(row.facilityName || "—")}</h4>
        <p class="certs-v2-doc-card__meta">${escapeHtml(this.fmtDateShort(row.updatedAt))}</p>
        <div class="certs-v2-doc-card__actions">
          <button type="button" class="tbl-btn tbl-btn-edit edit">${STR.editDoc}</button>
          <button type="button" class="tbl-btn tbl-btn-edit preview">${STR.viewDoc}</button>
          <button type="button" class="tbl-btn tbl-btn-print print">${STR.printDoc}</button>
          <button type="button" class="tbl-btn tbl-btn-del del">${STR.deleteDoc}</button>
        </div>`;
        this.bindDocRowActions(row, card);
        target.appendChild(card);
      });
    });
  }

  renderDocsList() {
    if (this.listMode === "cards") this.renderDocsCards();
    else this.renderDocsTable();
  }

  initDocSignature() {
    const canvas = this.$("docSignaturePad");
    if (!canvas || typeof SignaturePad === "undefined") {
      this.docSignaturePad = null;
      return;
    }
    this.docSignaturePad = new SignaturePad(canvas, {
      minWidth: 0.6,
      maxWidth: 2.2,
      penColor: "#0f172a",
    });
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = canvas.parentElement?.clientWidth || canvas.clientWidth || 300;
      canvas.width = w * ratio;
      canvas.height = 160 * ratio;
      canvas.getContext("2d").scale(ratio, ratio);
      this.docSignaturePad.clear();
    };
    resize();
    window.addEventListener("resize", resize);
    const clearBtn = this.$("docClearSig");
    if (clearBtn) clearBtn.onclick = () => this.docSignaturePad?.clear();
  }

  async bindDocForm() {
    const photosInput = this.$("docPhotosInput");
    if (photosInput) {
      photosInput.addEventListener("change", async (e) => {
        for (const f of Array.from(e.target.files || [])) {
          if (!f.type.startsWith("image/")) continue;
          this.docPhotos.push({ name: f.name, data: await this.readImageFile(f) });
        }
        e.target.value = "";
        this.renderDocPhotos();
      });
    }
    const docTypeEl = this.$("docType");
    if (docTypeEl) docTypeEl.addEventListener("change", () => this.onDocTypeChange());
    const formRoot = this.$("docForm")?.closest(".certs-v2, .cert-page");
    formRoot?.querySelectorAll("[data-cert-type-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.certTypeCard;
        if (type) this.setDocType(type);
      });
    });
    const addPortableRow = this.$("docPortableAddRow");
    if (addPortableRow) {
      addPortableRow.onclick = () => {
        this.portableAppliances.push(defaultPortableApplianceRow());
        this.renderPortableAppliancesTable();
      };
    }
    const addTechRow = this.$("docTechAddRow");
    if (addTechRow) {
      addTechRow.onclick = () => {
        this.techRowsState.push({ description: "", result: "—" });
        this.renderTechRowsTable();
      };
    }
    const addVisualRow = this.$("docVisualAddRow");
    if (addVisualRow) {
      addVisualRow.onclick = () => {
        this.visualChecklistState.push("");
        this.renderVisualChecklistTable();
      };
    }
    const searchEl = this.$("docsSearchInput");
    const typeFilterEl = this.$("docsTypeFilter");
    const statusFilterEl = this.$("docsStatusFilter");
    if (searchEl) searchEl.addEventListener("input", () => this.renderDocsList());
    if (typeFilterEl) typeFilterEl.addEventListener("change", () => this.renderDocsList());
    if (statusFilterEl) statusFilterEl.addEventListener("change", () => this.renderDocsList());
    const newBtn = this.$("newDocBtn");
    const saveBtn = this.$("saveDocBtn");
    const previewBtn = this.$("previewDocBtn");
    const printBtn = this.$("printDocBtn");
    const downloadBtn = this.$("downloadPdfBtn");
    const shareBtn = this.$("shareDocBtn");
    const finalizeBtn = this.$("finalizeDocBtn");
    if (newBtn) newBtn.onclick = () => this.fillDocForm(null);
    if (saveBtn) saveBtn.onclick = () => this.saveDoc();
    if (previewBtn) previewBtn.onclick = () => this.previewCurrentDoc();
    if (printBtn) printBtn.onclick = () => this.printCurrentDoc();
    if (downloadBtn) downloadBtn.onclick = () => this.downloadServerPdf();
    if (shareBtn) shareBtn.onclick = () => this.shareCurrentDoc();
    if (finalizeBtn) {
      finalizeBtn.onclick = async () => {
        this.setInputValue("docWorkflowStatus", "final");
        await this.saveDoc();
        this.showToast(STR.finalized, "ok");
      };
    }
    this.onDocTypeChange();
  }

  statsThisMonth() {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    let draft = 0;
    let final = 0;
    for (const d of this.docsCache) {
      const t = new Date(d.updatedAt || d.createdAt || 0);
      if (t.getMonth() !== m || t.getFullYear() !== y) continue;
      if (d.workflowStatus === "final") final++;
      else draft++;
    }
    return { draft, final, total: draft + final };
  }
}
