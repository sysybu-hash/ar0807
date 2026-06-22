import fs from "fs";

const html = fs.readFileSync("public/app.html", "utf8");
const start = html.indexOf('<div id="portal-documents"');
const end = html.indexOf("PANEL: INVOICES", start);
let block = html.slice(start, end);

block = block
  .replace(/id="portal-documents"/g, 'id="portal-documents-v2"')
  .replace(/aria-labelledby="tab-documents"/g, 'aria-labelledby="tab-documents-v2"')
  .replace(/class="cert-page"/g, 'class="certs-v2-inner"')
  .replace(/cert-page__/g, "certs-v2__")
  .replace(/cert-card/g, "certs-v2__card")
  .replace(/cert-fieldset/g, "certs-v2__fieldset")
  .replace(/cert-actions/g, "certs-v2__actions")
  .replace(/id="doc/g, 'id="v2Doc')
  .replace(/id="docs/g, 'id="v2Docs')
  .replace(/for="doc/g, 'for="v2Doc')
  .replace(/for="docs/g, 'for="v2Docs')
  .replace(/מיטלטל/g, "מטלטל")
  .replace(/ציוד מיטלטל/g, "צרכנים מטלטלים");

// Remove duplicate outer wrapper from block - it starts with portal-documents-v2
block = block.replace(/class="certs-v2-inner"/, 'class="certs-v2"');
block = block.replace(
  /<header class="certs-v2__header">[\s\S]*?<\/header>\s*<div class="filter-bar/,
  '<div class="filter-bar'
);

const typeCards = `
                <div class="certs-v2__type-cards" role="group" aria-label="סוג אישור">
                  <button type="button" class="certs-v2__type-card" data-cert-type-card="installation"><strong>תקינות מתקן</strong><span>מתקן חשמל קבוע</span></button>
                  <button type="button" class="certs-v2__type-card" data-cert-type-card="portable"><strong>צרכנים מטלטלים</strong><span>בדיקת PAT</span></button>
                  <button type="button" class="certs-v2__type-card" data-cert-type-card="ev_charging"><strong>עמדת טעינה</strong><span>IEC 60364-7-722</span></button>
                </div>`;

const stepsNav = `
                <nav class="certs-v2__steps" aria-label="שלבי הטופס">
                  <button type="button" class="certs-v2__step-btn is-active" data-step="0">כללי</button>
                  <button type="button" class="certs-v2__step-btn" data-step="1">פרטי אישור</button>
                  <button type="button" class="certs-v2__step-btn" data-step="2">בדיקות</button>
                  <button type="button" class="certs-v2__step-btn" data-step="3">חתימה וקבצים</button>
                </nav>`;

block = block.replace(
  '<form id="v2DocForm"',
  `${stepsNav}<form id="v2DocForm"`
);

block = block.replace(
  '<fieldset class="certs-v2__fieldset">\n                      <legend>פרטים כלליים</legend>',
  `<div class="certs-v2__step-panel" data-step-panel="general">${typeCards}<fieldset class="certs-v2__fieldset">\n                      <legend>פרטים כלליים</legend>`
);

block = block.replace(
  '<fieldset id="v2DocFieldsInstallation"',
  '</div><div class="certs-v2__step-panel hidden" data-step-panel="details"><fieldset id="v2DocFieldsInstallation"'
);

block = block.replace(
  '<fieldset class="certs-v2__fieldset">\n                      <legend>חתימה, תמונות וקבצים</legend>',
  '</div><div class="certs-v2__step-panel hidden" data-step-panel="signature"><fieldset class="certs-v2__fieldset">\n                      <legend>חתימה, תמונות וקבצים</legend>'
);

// Move tech/visual to checks step
block = block.replace(
  /(<div class="col-span-2">\s*<div class="doc-section-head">\s*<span class="lbl doc-section-head__label">בדיקות טכניות)/,
  '</div><div class="certs-v2__step-panel hidden" data-step-panel="checks">$1'
);

const header = `          <div id="portal-documents-v2" class="wizard-body portal-panel hidden certs-v2" role="tabpanel" aria-labelledby="tab-documents-v2">
            <header class="certs-v2__header">
              <div>
                <div class="certs-v2__title-row">
                  <h2 class="certs-v2__title">אישורי תקינות</h2>
                  <span class="certs-v2__beta">בטא</span>
                </div>
                <p class="certs-v2__subtitle">הנפקה, עריכה, הדפסה ושיתוף — מתקן חשמל, צרכנים מטלטלים ועמדת טעינה</p>
              </div>
              <p id="v2CertStats" class="certs-v2__stats" aria-live="polite"></p>
            </header>
            <div id="v2BlankBanner" class="certs-v2__blank-banner hidden" role="status">
              <span>הדפסה על דף בלאנק פעילה</span>
              <button type="button" id="v2BlankSettingsBtn" class="btn-portal-secondary btn-sm">הגדרות הדפסה</button>
            </div>
`;

// Fix block - remove duplicate opening div from block start
block = block.replace(/^[\s\S]*?<div id="portal-documents-v2"[^>]*>/, "");

const listReplace = block.replace(
  /<aside class="certs-v2__list">[\s\S]*?<tbody id="v2DocsTable"><\/tbody>[\s\S]*?<\/aside>/,
  `<aside class="certs-v2__list-panel">
                  <div class="certs-v2__list-head"><h3>מסמכים שמורים</h3></div>
                  <div id="v2DocsList" class="certs-v2__list-scroll" aria-label="רשימת מסמכים"></div>
                </aside>`
);

const mobileDrawer = `
            <div id="v2ListBackdrop" class="certs-v2__list-backdrop" aria-hidden="true"></div>
            <div id="v2ListDrawer" class="certs-v2__list-drawer" aria-hidden="true">
              <div class="certs-v2__list-drawer-head">
                <span>מסמכים שמורים</span>
                <button type="button" id="v2ListClose" class="btn-portal-secondary btn-sm">סגור</button>
              </div>
              <div class="certs-v2__list-drawer-body">
                <div id="v2DocsListMobile" class="certs-v2__list-scroll"></div>
              </div>
            </div>
            <div class="certs-v2__sticky-bar no-print">
              <button type="button" class="btn-portal-primary" onclick="document.getElementById('v2SaveDocBtn')?.click()">שמור</button>
              <button type="button" class="btn-portal-secondary" onclick="document.getElementById('v2PreviewDocBtn')?.click()">תצוגה</button>
              <button type="button" class="btn-portal-secondary" onclick="document.getElementById('v2PrintDocBtn')?.click()">הדפסה</button>
            </div>`;

// Rename save button ids are v2SaveDocBtn etc from v2Doc -> v2DocForm gives v2DocSaveDocBtn - need fix
// id="v2DocSaveDocBtn" from saveDocBtn -> v2SaveDocBtn wrong. saveDocBtn -> v2SaveDocBtn? 
// replace id="docSaveDocBtn" -> v2DocSaveDocBtn because doc + SaveDocBtn
// Actually id="saveDocBtn" -> v2SaveDocBtn if we replace id="doc with v2Doc only
// saveDocBtn doesn't start with doc - it stays saveDocBtn!

// Fix: also prefix buttons without doc prefix
listReplace.replace(/id="saveDocBtn"/g, 'id="v2SaveDocBtn"');

const panel = header + listReplace.replace(/id="saveDocBtn"/g, 'id="v2SaveDocBtn"')
  .replace(/id="newDocBtn"/g, 'id="v2NewDocBtn"')
  .replace(/id="previewDocBtn"/g, 'id="v2PreviewDocBtn"')
  .replace(/id="printDocBtn"/g, 'id="v2PrintDocBtn"')
  .replace(/id="downloadPdfBtn"/g, 'id="v2DownloadPdfBtn"')
  .replace(/id="shareDocBtn"/g, 'id="v2ShareDocBtn"')
  .replace(/id="finalizeDocBtn"/g, 'id="v2FinalizeDocBtn"') + mobileDrawer;

fs.writeFileSync("public/_certs-v2-panel.html", panel);
console.log("Generated", panel.length, "chars");
