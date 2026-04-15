import { Pool } from "pg";

let pool;

function safeJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function normalizeFinancialDoc(row) {
  return {
    id: Number(row.id),
    type: row.type,
    docNo: row.doc_no,
    allocationNo: row.allocation_no,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    customerName: row.customer_name,
    customerId: row.customer_id,
    customerAddress: row.customer_address,
    notes: row.notes ?? "",
    subtotal: Number(row.subtotal || 0),
    taxRate: Number(row.tax_rate || 0),
    taxAmount: Number(row.tax_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    status: row.status || "",
    items: safeJson(row.items_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required (Neon Postgres connection string).");
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  await migrate();
}

async function q(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function migrate() {
  await q(`
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
      use_blank_template BOOLEAN NOT NULL DEFAULT FALSE,
      blank_template_data TEXT,
      access_code TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await q(`ALTER TABLE inspector_settings ADD COLUMN IF NOT EXISTS use_blank_template BOOLEAN NOT NULL DEFAULT FALSE;`);
  await q(`ALTER TABLE inspector_settings ADD COLUMN IF NOT EXISTS blank_template_data TEXT;`);
  await q(`
    INSERT INTO inspector_settings (id, name, whatsapp, access_code)
    VALUES (1, 'אברהם רובינשטיין - חשמלאי מוסמך', '+972587600807', '1234')
    ON CONFLICT (id) DO NOTHING;
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS certificates (
      id BIGSERIAL PRIMARY KEY,
      doc_type TEXT DEFAULT 'installation',
      facility_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      connection_size TEXT DEFAULT '',
      grounding_value TEXT DEFAULT '',
      insulation TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      photos_json JSONB DEFAULT '[]'::jsonb,
      signature_data TEXT,
      extra_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS projects (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      client_name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      status TEXT DEFAULT 'planned',
      started_on TEXT DEFAULT '',
      completed_on TEXT DEFAULT '',
      description TEXT DEFAULT '',
      photos_json JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS financial_docs (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      doc_no TEXT DEFAULT '',
      allocation_no TEXT DEFAULT '',
      issue_date TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      customer_id TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      subtotal NUMERIC(12,2) DEFAULT 0,
      tax_rate NUMERIC(7,3) DEFAULT 18,
      tax_amount NUMERIC(12,2) DEFAULT 0,
      total_amount NUMERIC(12,2) DEFAULT 0,
      status TEXT DEFAULT '',
      items_json JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function getSettings() {
  const rows = await q(`SELECT * FROM inspector_settings WHERE id = 1`);
  const row = rows[0] || {};
  return {
    name: row.name ?? "",
    licenseNo: row.license_no ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    whatsapp: row.whatsapp ?? "",
    aboutText: row.about_text ?? "",
    logoData: row.logo_data ?? null,
    stampData: row.stamp_data ?? null,
    useBlankTemplate: !!row.use_blank_template,
    blankTemplateData: row.blank_template_data ?? null,
    accessCode: row.access_code ?? "",
    updatedAt: row.updated_at ?? null,
  };
}

export async function saveSettings(payload) {
  await q(
    `UPDATE inspector_settings SET
      name = $1,
      license_no = $2,
      phone = $3,
      email = $4,
      whatsapp = $5,
      about_text = $6,
      logo_data = $7,
      stamp_data = $8,
      use_blank_template = $9,
      blank_template_data = $10,
      access_code = $11,
      updated_at = now()
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
      !!payload.useBlankTemplate,
      payload.blankTemplateData ?? null,
      payload.accessCode ?? "",
    ]
  );
  return getSettings();
}

export async function listCertificates() {
  const rows = await q(
    `SELECT id,
            doc_type,
            facility_name,
            address,
            connection_size,
            grounding_value,
            insulation,
            notes,
            created_at,
            updated_at
     FROM certificates
     ORDER BY updated_at DESC`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    docType: r.doc_type,
    facilityName: r.facility_name,
    address: r.address,
    connectionSize: r.connection_size,
    groundingValue: r.grounding_value,
    insulation: r.insulation,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getCertificate(id) {
  const rows = await q(
    `SELECT id, doc_type, facility_name, address, connection_size, grounding_value,
            insulation, notes, photos_json, signature_data, extra_json,
            created_at, updated_at
     FROM certificates WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    docType: r.doc_type ?? "installation",
    facilityName: r.facility_name,
    address: r.address,
    connectionSize: r.connection_size,
    groundingValue: r.grounding_value,
    insulation: r.insulation,
    notes: r.notes,
    photos: safeJson(r.photos_json, []),
    signatureData: r.signature_data ?? null,
    extra: safeJson(r.extra_json, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function createCertificate(body) {
  const rows = await q(
    `INSERT INTO certificates (
      doc_type, facility_name, address, connection_size, grounding_value, insulation,
      notes, photos_json, signature_data, extra_json, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,now(),now())
    RETURNING id`,
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
    ]
  );
  return getCertificate(rows[0].id);
}

export async function updateCertificate(id, body) {
  const existing = await getCertificate(id);
  if (!existing) return null;
  await q(
    `UPDATE certificates SET
      doc_type = $1,
      facility_name = $2,
      address = $3,
      connection_size = $4,
      grounding_value = $5,
      insulation = $6,
      notes = $7,
      photos_json = $8::jsonb,
      signature_data = $9,
      extra_json = $10::jsonb,
      updated_at = now()
    WHERE id = $11`,
    [
      body.docType ?? existing.docType,
      body.facilityName ?? existing.facilityName,
      body.address ?? existing.address,
      body.connectionSize ?? existing.connectionSize,
      body.groundingValue ?? existing.groundingValue,
      body.insulation ?? existing.insulation,
      body.notes ?? existing.notes,
      JSON.stringify(body.photos ?? existing.photos),
      body.signatureData !== undefined ? body.signatureData : existing.signatureData,
      JSON.stringify(body.extra ?? existing.extra),
      id,
    ]
  );
  return getCertificate(id);
}

export async function deleteCertificate(id) {
  const rows = await q(`DELETE FROM certificates WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

export async function listProjects() {
  const rows = await q(
    `SELECT id, title, client_name, address, status, started_on, completed_on,
            description, photos_json, created_at, updated_at
     FROM projects
     ORDER BY updated_at DESC`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    clientName: r.client_name,
    address: r.address,
    status: r.status,
    startedOn: r.started_on,
    completedOn: r.completed_on,
    description: r.description,
    photos: safeJson(r.photos_json, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getProject(id) {
  const rows = await q(
    `SELECT id, title, client_name, address, status, started_on, completed_on,
            description, photos_json, created_at, updated_at
     FROM projects WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    title: r.title,
    clientName: r.client_name,
    address: r.address,
    status: r.status,
    startedOn: r.started_on,
    completedOn: r.completed_on,
    description: r.description,
    photos: safeJson(r.photos_json, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function createProject(body) {
  const rows = await q(
    `INSERT INTO projects (
      title, client_name, address, status, started_on, completed_on,
      description, photos_json, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),now())
    RETURNING id`,
    [
      body.title,
      body.clientName ?? "",
      body.address ?? "",
      body.status ?? "planned",
      body.startedOn ?? "",
      body.completedOn ?? "",
      body.description ?? "",
      JSON.stringify(body.photos ?? []),
    ]
  );
  return getProject(rows[0].id);
}

export async function updateProject(id, body) {
  const existing = await getProject(id);
  if (!existing) return null;
  await q(
    `UPDATE projects SET
      title = $1,
      client_name = $2,
      address = $3,
      status = $4,
      started_on = $5,
      completed_on = $6,
      description = $7,
      photos_json = $8::jsonb,
      updated_at = now()
    WHERE id = $9`,
    [
      body.title ?? existing.title,
      body.clientName ?? existing.clientName,
      body.address ?? existing.address,
      body.status ?? existing.status,
      body.startedOn ?? existing.startedOn,
      body.completedOn ?? existing.completedOn,
      body.description ?? existing.description,
      JSON.stringify(body.photos ?? existing.photos),
      id,
    ]
  );
  return getProject(id);
}

export async function deleteProject(id) {
  const rows = await q(`DELETE FROM projects WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

export async function listFinancialDocs(type) {
  const rows = type
    ? await q(`SELECT * FROM financial_docs WHERE type = $1 ORDER BY updated_at DESC`, [type])
    : await q(`SELECT * FROM financial_docs ORDER BY updated_at DESC`);
  return rows.map(normalizeFinancialDoc);
}

export async function getFinancialDoc(id) {
  const rows = await q(`SELECT * FROM financial_docs WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  return normalizeFinancialDoc(rows[0]);
}

export async function createFinancialDoc(body) {
  const rows = await q(
    `INSERT INTO financial_docs (
      type, doc_no, allocation_no, issue_date, due_date, customer_name, customer_id,
      customer_address, notes, subtotal, tax_rate, tax_amount, total_amount, status,
      items_json, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,now(),now())
    RETURNING id`,
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
    ]
  );
  return getFinancialDoc(rows[0].id);
}

export async function updateFinancialDoc(id, body) {
  const existing = await getFinancialDoc(id);
  if (!existing) return null;
  await q(
    `UPDATE financial_docs SET
      type = $1,
      doc_no = $2,
      allocation_no = $3,
      issue_date = $4,
      due_date = $5,
      customer_name = $6,
      customer_id = $7,
      customer_address = $8,
      notes = $9,
      subtotal = $10,
      tax_rate = $11,
      tax_amount = $12,
      total_amount = $13,
      status = $14,
      items_json = $15::jsonb,
      updated_at = now()
    WHERE id = $16`,
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
      id,
    ]
  );
  return getFinancialDoc(id);
}

export async function deleteFinancialDoc(id) {
  const rows = await q(`DELETE FROM financial_docs WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

export async function exportRowsForAccountant() {
  const invoiceRows = await listFinancialDocs("invoice");
  const quoteRows = await listFinancialDocs("quote");
  return { invoiceRows, quoteRows };
}
