import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  initDb,
  getSettings,
  saveSettings,
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

await initDb();

app.use(express.json({ limit: "50mb" }));
app.use(
  express.static(path.join(__dirname, "public"), {
    index: "app.html",
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/settings", async (_req, res) => {
  res.json(await getSettings());
});

app.put("/api/settings", async (req, res) => {
  try {
    res.json(await saveSettings(req.body ?? {}));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get("/api/certificates", async (_req, res) => {
  res.json(await listCertificates());
});

app.get("/api/certificates/:id", async (req, res) => {
  const row = await getCertificate(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "לא נמצא" });
  res.json(row);
});

app.post("/api/certificates", async (req, res) => {
  const body = req.body ?? {};
  if (!body.facilityName || String(body.facilityName).trim() === "") {
    return res.status(400).json({ error: "שם המתקן הוא שדה חובה" });
  }
  try {
    const created = await createCertificate(body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/certificates/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await updateCertificate(id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: "לא נמצא" });
  res.json(updated);
});

app.delete("/api/certificates/:id", async (req, res) => {
  const ok = await deleteCertificate(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "לא נמצא" });
  res.json({ ok: true });
});

app.get("/api/projects", async (_req, res) => {
  res.json(await listProjects());
});

app.get("/api/projects/:id", async (req, res) => {
  const row = await getProject(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "לא נמצא" });
  res.json(row);
});

app.post("/api/projects", async (req, res) => {
  const body = req.body ?? {};
  if (!body.title || String(body.title).trim() === "") {
    return res.status(400).json({ error: "שם פרויקט הוא שדה חובה" });
  }
  try {
    const created = await createProject(body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await updateProject(id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: "לא נמצא" });
  res.json(updated);
});

app.delete("/api/projects/:id", async (req, res) => {
  const ok = await deleteProject(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "לא נמצא" });
  res.json({ ok: true });
});

app.get("/api/financial-docs", async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : "";
  if (type && !["invoice", "quote"].includes(type)) {
    return res.status(400).json({ error: "type לא תקין" });
  }
  res.json(await listFinancialDocs(type || undefined));
});

app.get("/api/financial-docs/:id", async (req, res) => {
  const row = await getFinancialDoc(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "לא נמצא" });
  res.json(row);
});

app.post("/api/financial-docs", async (req, res) => {
  const body = req.body ?? {};
  if (!["invoice", "quote"].includes(body.type)) {
    return res.status(400).json({ error: "type חייב להיות invoice או quote" });
  }
  if (!body.customerName || String(body.customerName).trim() === "") {
    return res.status(400).json({ error: "שם לקוח הוא שדה חובה" });
  }
  try {
    const created = await createFinancialDoc(body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/financial-docs/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await updateFinancialDoc(id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: "לא נמצא" });
  res.json(updated);
});

app.delete("/api/financial-docs/:id", async (req, res) => {
  const ok = await deleteFinancialDoc(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "לא נמצא" });
  res.json({ ok: true });
});

app.get("/api/exports/accountant.csv", async (_req, res) => {
  const { invoiceRows, quoteRows } = await exportRowsForAccountant();
  const rows = [
    [
      "סוג",
      "מספר מסמך",
      "מספר הקצאה",
      "תאריך",
      "שם לקוח",
      "ח.פ/ת.ז",
      "סכום לפני מעמ",
      "מעמ",
      "סהכ",
      "סטטוס",
    ],
  ];

  for (const doc of [...invoiceRows, ...quoteRows]) {
    rows.push([
      doc.type === "invoice" ? "חשבונית" : "הצעת מחיר",
      doc.docNo || "",
      doc.allocationNo || "",
      doc.issueDate || "",
      doc.customerName || "",
      doc.customerId || "",
      String(doc.subtotal ?? ""),
      String(doc.taxAmount ?? ""),
      String(doc.totalAmount ?? ""),
      doc.status || "",
    ]);
  }

  const escapeCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=accountant-export.csv");
  res.send(`\uFEFF${csv}`);
});

app.listen(PORT, () => {
  console.log(`מערכת אישורים: http://localhost:${PORT}`);
});
