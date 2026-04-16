import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
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
} from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3847;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    const s = Math.random().toString(36).slice(2) + Date.now().toString(36);
    console.warn("[auth] JWT_SECRET not set — using ephemeral secret");
    return s;
  })();

const JWT_EXPIRES_IN = "7d";

await initDb();

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "יותר מדי בקשות — נסה שוב מאוחר יותר." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "יותר מדי ניסיונות כניסה — נסה שוב בעוד 15 דקות." },
  skipSuccessfulRequests: true,
});

app.use(express.json({ limit: "50mb" }));
app.use(generalLimiter);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.static(path.join(__dirname, "public"), { index: "app.html" }));

function signToken() {
  return jwt.sign({ sub: "inspector" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "נדרשת כניסה לאיזור האישי." });
  try {
    jwt.verify(token, JWT_SECRET);
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

// Public settings — home page uses this to render name, phone, WhatsApp etc.
// accessCode is stripped for security.
app.get("/api/settings", async (_req, res) => {
  try {
    const { accessCode: _omit, ...pub } = await getSettings();
    res.json(pub);
  } catch (e) {
    console.error("[GET /api/settings]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

// ── Protected routes ──────────────────────────────────────────────────────────

app.use("/api", requireAuth);

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
    const limit = Math.min(500, Number(req.query.limit) || 500);
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
    const limit = Math.min(500, Number(req.query.limit) || 500);
    const offset = Number(req.query.offset) || 0;
    res.json(await listProjects({ limit, offset }));
  } catch (e) {
    console.error("[GET /api/projects]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
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
    const type = typeof req.query.type === "string" ? req.query.type : "";
    if (type && !["invoice", "quote"].includes(type))
      return res.status(400).json({ error: "type לא תקין" });
    const limit = Math.min(500, Number(req.query.limit) || 500);
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
    const header = ["סוג","מספר מסמך","מספר הקצאה","תאריך","שם לקוח","ח.פ/ת.ז","סכום לפני מעמ","מעמ","סהכ","סטטוס"];
    const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const lines = [header.map(esc).join(",")];
    for (const d of [...invoiceRows, ...quoteRows]) {
      lines.push([
        d.type === "invoice" ? "חשבונית" : "הצעת מחיר",
        d.docNo||"", d.allocationNo||"", d.issueDate||"",
        d.customerName||"", d.customerId||"",
        String(d.subtotal??0), String(d.taxAmount??0), String(d.totalAmount??0),
        d.status||"",
      ].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=accountant-export.csv");
    res.send("\uFEFF" + lines.join("\n"));
  } catch (e) {
    console.error("[GET /api/exports/accountant.csv]", e.message);
    res.status(500).json({ error: "שגיאת שרת." });
  }
});

app.listen(PORT, () => console.log("מערכת אישורים: http://localhost:" + PORT));
