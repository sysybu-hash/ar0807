import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "certs.sqlite");

let db;

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function rowFromExec(execResult, rowIndex = 0) {
  if (!execResult || !execResult.length) return null;
  const { columns, values } = execResult[0];
  const v = values[rowIndex];
  if (!v) return null;
  const o = {};
  columns.forEach((c, i) => {
    o[c] = v[i];
  });
  return o;
}

function allFromExec(execResult) {
  if (!execResult || !execResult.length) return [];
  const { columns, values } = execResult[0];
  return (values || []).map((v) => {
    const o = {};
    columns.forEach((c, i) => {
      o[c] = v[i];
    });
    return o;
  });
}

function safeJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function hasColumn(tableName, columnName) {
  const rows = allFromExec(db.exec(`PRAGMA table_info(${tableName})`));
  return rows.some((r) => r.name === columnName);
}

function ensureColumn(tableName, columnDef) {
  const name = columnDef.trim().split(/\s+/)[0];
  if (!hasColumn(tableName, name)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
  }
}

function normalizeFinancialDoc(row) {
  return {
    id: row.id,
    type: row.type,
    docNo: row.docNo,
    allocationNo: row.allocationNo,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    customerName: row.customerName,
    customerId: row.customerId,
    customerAddress: row.customerAddress,
    notes: row.notes ?? "",
    subtotal: Number(row.subtotal || 0),
    taxRate: Number(row.taxRate || 0),
    taxAmount: Number(row.taxAmount || 0),
    totalAmount: Number(row.totalAmount || 0),
    status: row.status || "",
    items: safeJson(row.itemsJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function initDb() {
  const wasmDir = path.join(__dirname, "node_modules", "sql.js", "dist");
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmDir, file),
  });
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }
  migrate();
  persist();
}

function migrate() {
  db.run(`
    CREATE TABLE IF NOT EXISTS inspector_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT DEFAULT '',
      license_no TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      whatsapp TEXT DEFAULT '',
      about_text TEXT DEFAULT '',
      logo_data TEXT,
      stamp_data TEXT,
      access_code TEXT DEFAULT '',
      updated_at TEXT
    );
  `);
  ensureColumn("inspector_settings", "whatsapp TEXT DEFAULT ''");
  ensureColumn("inspector_settings", "about_text TEXT DEFAULT ''");
  ensureColumn("inspector_settings", "access_code TEXT DEFAULT ''");
  db.run(`
    INSERT OR IGNORE INTO inspector_settings (id, name, updated_at)
    VALUES (1, 'אברהם רובינשטיין - חשמלאי מוסמך', datetime('now'));
  `);
  db.run(`
    UPDATE inspector_settings
    SET whatsapp = COALESCE(NULLIF(whatsapp, ''), '+972587600807'),
        access_code = COALESCE(NULLIF(access_code, ''), '1234')
    WHERE id = 1
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type TEXT DEFAULT 'installation',
      facility_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      connection_size TEXT DEFAULT '',
      grounding_value TEXT DEFAULT '',
      insulation TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      photos_json TEXT DEFAULT '[]',
      signature_data TEXT,
      extra_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureColumn("certificates", "doc_type TEXT DEFAULT 'installation'");

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client_name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      status TEXT DEFAULT 'planned',
      started_on TEXT DEFAULT '',
      completed_on TEXT DEFAULT '',
      description TEXT DEFAULT '',
      photos_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS financial_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      doc_no TEXT DEFAULT '',
      allocation_no TEXT DEFAULT '',
      issue_date TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      customer_id TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 18,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT '',
      items_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getSettings() {
  const row = rowFromExec(
    db.exec("SELECT * FROM inspector_settings WHERE id = 1")
  );
  return {
    name: row?.name ?? "",
    licenseNo: row?.license_no ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    whatsapp: row?.whatsapp ?? "",
    aboutText: row?.about_text ?? "",
    logoData: row?.logo_data ?? null,
    stampData: row?.stamp_data ?? null,
    accessCode: row?.access_code ?? "",
    updatedAt: row?.updated_at ?? null,
  };
}

export function saveSettings(payload) {
  db.run(
    `UPDATE inspector_settings SET
      name = ?,
      license_no = ?,
      phone = ?,
      email = ?,
      whatsapp = ?,
      about_text = ?,
      logo_data = ?,
      stamp_data = ?,
      access_code = ?,
      updated_at = datetime('now')
    WHERE id = 1`,
    [
      payload.name ?? "",
      payload.licenseNo ?? "",
      payload.phone ?? "",
      payload.email ?? "",
      payload.whatsapp ?? "",
      payload.aboutText ?? "",
      payload.logoData ?? null,
      payload.stampData ?? null,
      payload.accessCode ?? "",
    ]
  );
  persist();
  return getSettings();
}

export function listCertificates() {
  return allFromExec(
    db.exec(
      `SELECT id,
              doc_type AS docType,
              facility_name AS facilityName,
              address,
              connection_size AS connectionSize,
              grounding_value AS groundingValue,
              insulation,
              notes,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM certificates
       ORDER BY datetime(updated_at) DESC`
    )
  );
}

export function getCertificate(id) {
  const stmt = db.prepare(
    `SELECT id,
            doc_type AS docType,
            facility_name AS facilityName,
            address,
            connection_size AS connectionSize,
            grounding_value AS groundingValue,
            insulation,
            notes,
            photos_json AS photosJson,
            signature_data AS signatureData,
            extra_json AS extraJson,
            created_at AS createdAt,
            updated_at AS updatedAt
     FROM certificates WHERE id = ?`
  );
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return {
    id: row.id,
    docType: row.docType ?? "installation",
    facilityName: row.facilityName,
    address: row.address,
    connectionSize: row.connectionSize,
    groundingValue: row.groundingValue,
    insulation: row.insulation,
    notes: row.notes,
    photos: safeJson(row.photosJson, []),
    signatureData: row.signatureData ?? null,
    extra: safeJson(row.extraJson, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createCertificate(body) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO certificates (
      doc_type, facility_name, address, connection_size, grounding_value, insulation, notes,
      photos_json, signature_data, extra_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.docType || "installation",
      body.facilityName,
      body.address ?? "",
      body.connectionSize ?? "",
      body.groundingValue ?? "",
      body.insulation ?? "",
      body.notes ?? "",
      JSON.stringify(body.photos ?? []),
      body.signatureData ?? null,
      JSON.stringify(body.extra ?? {}),
      now,
      now,
    ]
  );
  const id = rowFromExec(db.exec("SELECT last_insert_rowid() AS id")).id;
  persist();
  return getCertificate(id);
}

export function updateCertificate(id, body) {
  const existing = getCertificate(id);
  if (!existing) return null;
  db.run(
    `UPDATE certificates SET
      doc_type = ?,
      facility_name = ?,
      address = ?,
      connection_size = ?,
      grounding_value = ?,
      insulation = ?,
      notes = ?,
      photos_json = ?,
      signature_data = ?,
      extra_json = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      body.docType ?? existing.docType,
      body.facilityName ?? existing.facilityName,
      body.address ?? existing.address,
      body.connectionSize ?? existing.connectionSize,
      body.groundingValue ?? existing.groundingValue,
      body.insulation ?? existing.insulation,
      body.notes ?? existing.notes,
      JSON.stringify(body.photos ?? existing.photos),
      body.signatureData !== undefined
        ? body.signatureData
        : existing.signatureData,
      JSON.stringify(body.extra ?? existing.extra),
      new Date().toISOString(),
      id,
    ]
  );
  persist();
  return getCertificate(id);
}

export function deleteCertificate(id) {
  db.run("DELETE FROM certificates WHERE id = ?", [id]);
  const row = rowFromExec(db.exec("SELECT changes() AS c"));
  persist();
  return Number(row?.c || 0) > 0;
}

export function listProjects() {
  return allFromExec(
    db.exec(
      `SELECT id, title, client_name AS clientName, address, status,
              started_on AS startedOn, completed_on AS completedOn,
              description, photos_json AS photosJson,
              created_at AS createdAt, updated_at AS updatedAt
       FROM projects ORDER BY datetime(updated_at) DESC`
    )
  ).map((r) => ({
    ...r,
    photos: safeJson(r.photosJson, []),
  }));
}

export function getProject(id) {
  const stmt = db.prepare(
    `SELECT id, title, client_name AS clientName, address, status,
            started_on AS startedOn, completed_on AS completedOn,
            description, photos_json AS photosJson,
            created_at AS createdAt, updated_at AS updatedAt
     FROM projects WHERE id = ?`
  );
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return {
    ...row,
    photos: safeJson(row.photosJson, []),
  };
}

export function createProject(body) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO projects (
      title, client_name, address, status, started_on, completed_on,
      description, photos_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.title,
      body.clientName ?? "",
      body.address ?? "",
      body.status ?? "planned",
      body.startedOn ?? "",
      body.completedOn ?? "",
      body.description ?? "",
      JSON.stringify(body.photos ?? []),
      now,
      now,
    ]
  );
  const id = rowFromExec(db.exec("SELECT last_insert_rowid() AS id")).id;
  persist();
  return getProject(id);
}

export function updateProject(id, body) {
  const existing = getProject(id);
  if (!existing) return null;
  db.run(
    `UPDATE projects SET
      title = ?,
      client_name = ?,
      address = ?,
      status = ?,
      started_on = ?,
      completed_on = ?,
      description = ?,
      photos_json = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      body.title ?? existing.title,
      body.clientName ?? existing.clientName,
      body.address ?? existing.address,
      body.status ?? existing.status,
      body.startedOn ?? existing.startedOn,
      body.completedOn ?? existing.completedOn,
      body.description ?? existing.description,
      JSON.stringify(body.photos ?? existing.photos),
      new Date().toISOString(),
      id,
    ]
  );
  persist();
  return getProject(id);
}

export function deleteProject(id) {
  db.run("DELETE FROM projects WHERE id = ?", [id]);
  const row = rowFromExec(db.exec("SELECT changes() AS c"));
  persist();
  return Number(row?.c || 0) > 0;
}

export function listFinancialDocs(type) {
  const where = type ? "WHERE type = ?" : "";
  const query = `
    SELECT id, type,
           doc_no AS docNo,
           allocation_no AS allocationNo,
           issue_date AS issueDate,
           due_date AS dueDate,
           customer_name AS customerName,
           customer_id AS customerId,
           customer_address AS customerAddress,
           notes, subtotal, tax_rate AS taxRate, tax_amount AS taxAmount,
           total_amount AS totalAmount, status,
           items_json AS itemsJson,
           created_at AS createdAt, updated_at AS updatedAt
    FROM financial_docs
    ${where}
    ORDER BY datetime(updated_at) DESC
  `;
  const rows = type ? allFromExec(db.exec(query, [type])) : allFromExec(db.exec(query));
  return rows.map(normalizeFinancialDoc);
}

export function getFinancialDoc(id) {
  const stmt = db.prepare(
    `SELECT id, type,
            doc_no AS docNo,
            allocation_no AS allocationNo,
            issue_date AS issueDate,
            due_date AS dueDate,
            customer_name AS customerName,
            customer_id AS customerId,
            customer_address AS customerAddress,
            notes, subtotal, tax_rate AS taxRate, tax_amount AS taxAmount,
            total_amount AS totalAmount, status,
            items_json AS itemsJson,
            created_at AS createdAt, updated_at AS updatedAt
     FROM financial_docs WHERE id = ?`
  );
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return normalizeFinancialDoc(row);
}

export function createFinancialDoc(body) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO financial_docs (
      type, doc_no, allocation_no, issue_date, due_date, customer_name, customer_id,
      customer_address, notes, subtotal, tax_rate, tax_amount, total_amount, status,
      items_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.type,
      body.docNo ?? "",
      body.allocationNo ?? "",
      body.issueDate ?? "",
      body.dueDate ?? "",
      body.customerName ?? "",
      body.customerId ?? "",
      body.customerAddress ?? "",
      body.notes ?? "",
      body.subtotal ?? 0,
      body.taxRate ?? 18,
      body.taxAmount ?? 0,
      body.totalAmount ?? 0,
      body.status ?? "",
      JSON.stringify(body.items ?? []),
      now,
      now,
    ]
  );
  const id = rowFromExec(db.exec("SELECT last_insert_rowid() AS id")).id;
  persist();
  return getFinancialDoc(id);
}

export function updateFinancialDoc(id, body) {
  const existing = getFinancialDoc(id);
  if (!existing) return null;
  db.run(
    `UPDATE financial_docs SET
      type = ?,
      doc_no = ?,
      allocation_no = ?,
      issue_date = ?,
      due_date = ?,
      customer_name = ?,
      customer_id = ?,
      customer_address = ?,
      notes = ?,
      subtotal = ?,
      tax_rate = ?,
      tax_amount = ?,
      total_amount = ?,
      status = ?,
      items_json = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      body.type ?? existing.type,
      body.docNo ?? existing.docNo,
      body.allocationNo ?? existing.allocationNo,
      body.issueDate ?? existing.issueDate,
      body.dueDate ?? existing.dueDate,
      body.customerName ?? existing.customerName,
      body.customerId ?? existing.customerId,
      body.customerAddress ?? existing.customerAddress,
      body.notes ?? existing.notes,
      body.subtotal ?? existing.subtotal,
      body.taxRate ?? existing.taxRate,
      body.taxAmount ?? existing.taxAmount,
      body.totalAmount ?? existing.totalAmount,
      body.status ?? existing.status,
      JSON.stringify(body.items ?? existing.items),
      new Date().toISOString(),
      id,
    ]
  );
  persist();
  return getFinancialDoc(id);
}

export function deleteFinancialDoc(id) {
  db.run("DELETE FROM financial_docs WHERE id = ?", [id]);
  const row = rowFromExec(db.exec("SELECT changes() AS c"));
  persist();
  return Number(row?.c || 0) > 0;
}

export function exportRowsForAccountant() {
  const invoiceRows = listFinancialDocs("invoice");
  const quoteRows = listFinancialDocs("quote");
  return { invoiceRows, quoteRows };
}
