import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createHmac, timingSafeEqual } from "crypto";
import {
  initDb,
  getSettings,
  saveSettings,
  verifyAccessCode,
  listCertificates,
  getCertificate,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  createCertificateShare,
  getCertificateShareByToken,
  pruneExpiredCertificateShares,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  listFinancialDocs,
  getFinancialDoc,
  createFinancialDoc,
  updateFinancialDoc,
  deleteFinancialDoc,
  exportRowsForAccountant,
  createProjectFromWizard,
} from "./db.mjs";
import { buildCertificatePdfBuffer } from "./certificate-pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3847;

if (process.env.SENTRY_DSN) {
  import("@sentry/node")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        tracesSampleRate: 0,
      });
    })
    .catch((e) => console.error("[sentry]", e.message));
}

function inspectorForPdf(settings) {
  return {
    name: settings.name ?? "",
    licenseNo: settings.licenseNo ?? "",
    phone: settings.phone ?? "",
    logoData: settings.logoData ?? null,
    stampData: settings.stampData ?? null,
    inspectorDeclarationText: settings.inspectorDeclarationText ?? "",
    stampOffsetXmm: Number(settings.stampOffsetXmm || 0),
    stampOffsetYmm: Number(settings.stampOffsetYmm || 0),
  };
}

function publicBaseUrl(req) {
  const env = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  const xf = req.get("x-forwarded-host");
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  if (xf) return `${proto}://${xf}`;
  return `${req.protocol}://${req.get("host")}`;
}

const IS_PRODUCTION =
  process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const JWT_SECRET_ENV = process.env.JWT_SECRET?.trim();

if (IS_PRODUCTION && !JWT_SECRET_ENV) {
  throw new Error(
    "JWT_SECRET is required in production. Add it in Vercel → Settings → Environment Variables (or .env for local production)."
  );
}

const JWT_SECRET =
  JWT_SECRET_ENV ||
  (() => {
    const s = Math.random().toString(36).slice(2) + Date.now().toString(36);
    console.warn("[auth] JWT_SECRET not set — using ephemeral secret (dev only; sessions reset on restart)");
    return s;
  })();

// ── Lightweight JWT (HS256) — Node built-in crypto only, no external lib ──────

function b64u(str) {
  return Buffer.from(str).toString("base64url");
}

function signToken() {
  const header  = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat     = Math.floor(Date.now() / 1000);
  const payload = b64u(JSON.stringify({ sub: "inspector", iat, exp: iat + 7 * 24 * 3600 }));
  const sig     = createHmac("sha256", JWT_SECRET).update(header + "." + payload).digest("base64url");
  return header + "." + payload + "." + sig;
}

function verifyJwt(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [header, payload, sig] = parts;
  const expected = createHmac("sha256", JWT_SECRET).update(header + "." + payload).digest("base64url");
  const sBuf = Buffer.from(sig,      "base64url");
  const eBuf = Buffer.from(expected, "base64url");
  if (sBuf.length !== eBuf.length || !timingSafeEqual(sBuf, eBuf))
    throw new Error("invalid signature");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) throw new Error("token expired");
  return claims;
}

// ── Simple in-memory rate limiter (no external lib) ───────────────────────────

function makeRateLimiter(max, windowMs, message) {
  const store = new Map();
  return (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    let e = store.get(key);
    if (!e || now > e.resetAt) e = { count: 0, resetAt: now + windowMs };
    e.count++;
    store.set(key, e);
    if (e.count > max) return res.status(429).json({ error: message });
    next();
  };
}

const generalLimiter = makeRateLimiter(200, 15 * 60 * 1000, "יותר מדי בקשות — נסה שוב מאוחר יותר.");
const authLimiter    = makeRateLimiter(10,  15 * 60 * 1000, "יותר מדי ניסיונות כניסה — נסה שוב בעוד 15 דקות.");

// ── DB lazy init ──────────────────────────────────────────────────────────────

let _dbReady = false;
async function ensureDb(req, res, next) {
  if (_dbReady) return next();
  try {
    await initDb();
    _dbReady = true;
    next();
  } catch (err) {
    console.error("[db] init failed:", err.message);
    res.status(503).json({ error: "שירות לא זמין כרגע — נסה שוב." });
  }
}

// ── Express setup ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: "50mb" }));
app.use(generalLimiter);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/share/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "share.html"));
});

app.use(express.static(path.join(__dirname, "public"), { index: "app.html" }));
app.use(ensureDb);

// ── Public APIs (no JWT) ──────────────────────────────────────────────────────

app.get("/api/share/:token/pdf", async (req, res) => {
  try {
    const raw = req.params.token;
    const data = await getCertificateShareByToken(raw);
    if (!data) return res.status(404).type("text/plain; charset=utf-8").send("הקישור פג תוקף או לא נמצא.");
    const settings = await getSettings();
    const pdf = await buildCertificatePdfBuffer({
      certificate: data.certificate,
      inspector: inspectorForPdf(settings),
    });
    const id = data.certificate.id;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="certificate-${id}.pdf"`
    );
    res.send(pdf);
  } catch (e) {
    console.error("[GET /api/share/:token/pdf]", e.message);
    res.status(500).type("text/plain; charset=utf-8").send("שגיאת שרת.");
  }
});

app.get("/api/share/:token", async (req, res) => {
  try {
    const data = await getCertificateShareByToken(req.params.token);
    if (!data) return res.status(404).json({ error: "הקישור פג תוקף או לא נמצא." });
    const settings = await getSettings();
    res.json({
      certificate: data.certificate,
      inspector: {
        name: settings.name ?? "",
        licenseNo: settings.licenseNo ?? "",
      },
      expiresAt: data.share.expiresAt,
    });
  } catch (e) {
    console.error("[GET /api/share/:token]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.get("/api/cron/maintenance", async (req, res) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return res.status(503).json({ error: "תחזוקה מתוזמנת לא הוגדרה (CRON_SECRET)." });
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  const got = String(req.headers["x-cron-secret"] || req.query.secret || bearer || "").trim();
  if (got !== secret) return res.status(401).json({ error: "לא מורשה." });
  try {
    const prunedShares = await pruneExpiredCertificateShares();
    res.json({ ok: true, prunedShares });
  } catch (e) {
    console.error("[cron/maintenance]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "נדרשת כניסה לאיזור האישי." });
  try {
    verifyJwt(token);
    next();
  } catch {
    return res.status(401).json({ error: "פג תוקף הכניסה — יש להתחבר מחדש." });
  }
}

// ── Public routes ─────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ error: "קוד גישה לא סופק." });
    const ok = await verifyAccessCode(code);
    if (!ok) return res.status(401).json({ error: "קוד שגוי." });
    res.json({ token: signToken() });
  } catch (e) {
    console.error("[auth/login]", e.message);
    res.status(500).json({ error: "שגיאת שרת — נסה שוב." });
  }
});

// GET /api/settings: public → stripped; authenticated → full (with blankTemplateData)
app.get("/api/settings", async (req, res) => {
  try {
    const full = await getSettings();
    const header = req.headers.authorization || "";
    const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
    let authed = false;
    if (token) { try { verifyJwt(token); authed = true; } catch {} }
    if (authed) {
      return res.json(full);
    }
    // Public: omit fields used only for authenticated portal / print templates so the
    // client can merge without overwriting stored blank/stamp settings when no JWT is sent.
    const {
      accessCode: _a,
      blankTemplateData: _b,
      useBlankTemplate: _u,
      blankOffsetXmm: _bx,
      blankOffsetYmm: _by,
      blankScale: _bs,
      inspectorDeclarationText: _d,
      stampOffsetXmm: _sx,
      stampOffsetYmm: _sy,
      ...pub
    } = full;
    res.json(pub);
  } catch (e) {
    console.error("[GET /api/settings]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

// ── Protected routes ──────────────────────────────────────────────────────────

app.use("/api", requireAuth);

app.get("/api/certificates/:id/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "מזהה לא תקין" });
    const row = await getCertificate(id);
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    const settings = await getSettings();
    const pdf = await buildCertificatePdfBuffer({
      certificate: row,
      inspector: inspectorForPdf(settings),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="certificate-${id}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error("[GET /api/certificates/:id/pdf]", e.message);
    res.status(500).json({ error: "שגיאת יצירת PDF." });
  }
});

app.post("/api/certificates/:id/share", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "מזהה לא תקין" });
    const hours = Number(req.body?.hoursValid ?? 72);
    const created = await createCertificateShare(id, hours);
    if (!created) return res.status(404).json({ error: "לא נמצא" });
    const base = publicBaseUrl(req);
    const url = `${base}/share/${encodeURIComponent(created.token)}`;
    res.status(201).json({
      url,
      token: created.token,
      expiresAt: created.expiresAt,
      hoursValid: created.hoursValid,
    });
  } catch (e) {
    console.error("[POST /api/certificates/:id/share]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.put("/api/settings", async (req, res) => {
  try {
    res.json(await saveSettings(req.body ?? {}));
  } catch (e) {
    console.error("[PUT /api/settings]", e.message);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get("/api/certificates", async (req, res) => {
  try {
    const limit  = Math.min(500, Number(req.query.limit)  || 500);
    const offset = Number(req.query.offset) || 0;
    res.json(await listCertificates({ limit, offset }));
  } catch (e) {
    console.error("[GET /api/certificates]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.get("/api/certificates/:id", async (req, res) => {
  try {
    const row = await getCertificate(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (e) {
    console.error("[GET /api/certificates/:id]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.post("/api/certificates", async (req, res) => {
  try {
    const body = req.body ?? {};
    if (!body.facilityName || String(body.facilityName).trim() === "")
      return res.status(400).json({ error: "שם המתקן הוא שדה חובה" });
    res.status(201).json(await createCertificate(body));
  } catch (e) {
    console.error("[POST /api/certificates]", e.message);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/certificates/:id", async (req, res) => {
  try {
    const updated = await updateCertificate(Number(req.params.id), req.body ?? {});
    if (!updated) return res.status(404).json({ error: "לא נמצא" });
    res.json(updated);
  } catch (e) {
    console.error("[PUT /api/certificates/:id]", e.message);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.delete("/api/certificates/:id", async (req, res) => {
  try {
    const ok = await deleteCertificate(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "לא נמצא" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/certificates/:id]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    const limit  = Math.min(500, Number(req.query.limit)  || 500);
    const offset = Number(req.query.offset) || 0;
    res.json(await listProjects({ limit, offset }));
  } catch (e) {
    console.error("[GET /api/projects]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.post("/api/projects/wizard", async (req, res) => {
  try {
    const row = await createProjectFromWizard(req.body ?? {});
    res.status(201).json({
      success: true,
      message: "הפרויקט הוקם בהצלחה",
      projectId: row.id,
    });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("שם פרויקט")) {
      return res.status(400).json({ error: msg });
    }
    console.error("[POST /api/projects/wizard]", e.message);
    res.status(500).json({ error: "שגיאת שרת בשמירת הנתונים" });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  try {
    const row = await getProject(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (e) {
    console.error("[GET /api/projects/:id]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const body = req.body ?? {};
    if (!body.title || String(body.title).trim() === "")
      return res.status(400).json({ error: "שם פרויקט הוא שדה חובה" });
    res.status(201).json(await createProject(body));
  } catch (e) {
    console.error("[POST /api/projects]", e.message);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    const updated = await updateProject(Number(req.params.id), req.body ?? {});
    if (!updated) return res.status(404).json({ error: "לא נמצא" });
    res.json(updated);
  } catch (e) {
    console.error("[PUT /api/projects/:id]", e.message);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    const ok = await deleteProject(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "לא נמצא" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/projects/:id]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.get("/api/financial-docs", async (req, res) => {
  try {
    const type   = typeof req.query.type === "string" ? req.query.type : "";
    if (type && !["invoice", "quote"].includes(type))
      return res.status(400).json({ error: "type לא תקין" });
    const limit  = Math.min(500, Number(req.query.limit)  || 500);
    const offset = Number(req.query.offset) || 0;
    res.json(await listFinancialDocs(type || undefined, { limit, offset }));
  } catch (e) {
    console.error("[GET /api/financial-docs]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.get("/api/financial-docs/:id", async (req, res) => {
  try {
    const row = await getFinancialDoc(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (e) {
    console.error("[GET /api/financial-docs/:id]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.post("/api/financial-docs", async (req, res) => {
  try {
    const body = req.body ?? {};
    if (!["invoice", "quote"].includes(body.type))
      return res.status(400).json({ error: "type חייב להיות invoice או quote" });
    if (!body.customerName || String(body.customerName).trim() === "")
      return res.status(400).json({ error: "שם לקוח הוא שדה חובה" });
    res.status(201).json(await createFinancialDoc(body));
  } catch (e) {
    console.error("[POST /api/financial-docs]", e.message);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/financial-docs/:id", async (req, res) => {
  try {
    const updated = await updateFinancialDoc(Number(req.params.id), req.body ?? {});
    if (!updated) return res.status(404).json({ error: "לא נמצא" });
    res.json(updated);
  } catch (e) {
    console.error("[PUT /api/financial-docs/:id]", e.message);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.delete("/api/financial-docs/:id", async (req, res) => {
  try {
    const ok = await deleteFinancialDoc(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "לא נמצא" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/financial-docs/:id]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.get("/api/exports/accountant.csv", async (_req, res) => {
  try {
    const { invoiceRows, quoteRows } = await exportRowsForAccountant();
    const cols = ["סוג","מספר מסמך","מספר הקצאה","תאריך","שם לקוח","ח.פ/ת.ז","סכום לפני מעמ","מעמ","סהכ","סטטוס"];
    const esc  = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = [cols.map(esc).join(",")];
    for (const d of [...invoiceRows, ...quoteRows]) {
      rows.push([
        d.type === "invoice" ? "חשבונית" : "הצעת מחיר",
        d.docNo||"", d.allocationNo||"", d.issueDate||"",
        d.customerName||"", d.customerId||"",
        String(d.subtotal??0), String(d.taxAmount??0), String(d.totalAmount??0),
        d.status||"",
      ].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=accountant-export.csv");
    res.send("\uFEFF" + rows.join("\n"));
  } catch (e) {
    console.error("[GET /api/exports/accountant.csv]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

// Vercel invokes the exported app; do not bind a port there.
// NODE_ENV=test — used by automated tests (supertest) without binding a port.
if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  app.listen(PORT, () =>
    console.log("\u05de\u05e2\u05e8\u05db\u05ea \u05d0\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd: http://localhost:" + PORT)
  );
}

export default app;
