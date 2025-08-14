// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ===== DB Connection =====
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_J1gloZUcFQS2@ep-still-truth-a1051s4o-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

// ===== Multer Setup =====
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${unique}-${file.originalname}`);
    }
  })
});

// =================== DOCUMENT ROUTES ===================

// Upload document
app.post('/upload', upload.single('file'), async (req, res) => {
  const { document_name, owner_dept } = req.body;
  const file = req.file;
  try {
    const result = await pool.query(
      `INSERT INTO policy_documents
       (document_name, owner_dept, approval_status, last_review, document_approved, file_data, file_name)
       VALUES ($1, $2, 'Pending', NULL, NULL, $3, $4)
       RETURNING document_id`,
      [document_name, owner_dept, file ? fs.readFileSync(file.path) : null, file ? file.originalname : null]
    );
    res.status(201).json({ document_id: result.rows[0].document_id });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all documents
app.get('/documents', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT document_id, document_name, owner_dept, approval_status, last_review, document_approved
      FROM policy_documents ORDER BY document_name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get document details
app.get('/document/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT document_id, document_name, owner_dept, approval_status, last_review, document_approved, file_name
      FROM policy_documents WHERE document_id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download document
app.get('/download/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT file_data, file_name FROM policy_documents WHERE document_id = $1`,
      [req.params.id]
    );
    if (!rows.length || !rows[0].file_data) return res.status(404).send('File not found');
    res.setHeader('Content-Disposition', `attachment; filename="${rows[0].file_name}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(rows[0].file_data);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Server error');
  }
});

// Approve document
app.put('/approve/:id', async (req, res) => {
  try {
    const now = new Date();
    const { rows } = await pool.query(`
      UPDATE policy_documents
      SET last_review = $1, 
          approval_status = 'Approved',
          document_approved = COALESCE(document_approved, $1)
      WHERE document_id = $2
      RETURNING last_review, approval_status, document_approved
    `, [now, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate without approving
app.put('/validate/:id', async (req, res) => {
  try {
    const now = new Date();
    const { rows } = await pool.query(`
      UPDATE policy_documents
      SET last_review = $1
      WHERE document_id = $2
      RETURNING last_review, approval_status, document_approved
    `, [now, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Validate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =================== LOGIN ROUTE ===================
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );
    if (result.rows.length > 0) {
      res.json({ success: true, message: "✅ Login successful!" });
    } else {
      res.json({ success: false, message: "❌ Invalid username or password." });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "⚠️ Server error." });
  }
});

// =================== AUDIT ROUTES ===================
app.get("/audits", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM audits ORDER BY audit_date DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("Fetch audits error:", error);
    res.status(500).json({ error: "Failed to fetch audits." });
  }
});

app.get("/audit-status-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TRIM(LOWER(status)) AS normalized_status, COUNT(*) as count
      FROM audits
      GROUP BY normalized_status
    `);

    const data = result.rows.map((row) => {
      let label;
      switch (row.normalized_status) {
        case "completed": label = "Completed"; break;
        case "scheduled": label = "Scheduled"; break;
        case "in progress": label = "In Progress"; break;
        case "pending": label = "Pending"; break;
        default:
          label = row.normalized_status.charAt(0).toUpperCase() + row.normalized_status.slice(1);
      }
      return { status: label, count: row.count };
    });

    res.json(data);
  } catch (error) {
    console.error("Fetch audit summary error:", error);
    res.status(500).json({ error: "Failed to fetch audit summary." });
  }
});

app.post("/audits", async (req, res) => {
  const { audit_id, audit_name, dept_audited, auditor, audit_date, status } = req.body;
  try {
    const insertQuery = `
      INSERT INTO audits (audit_id, audit_name, dept_audited, auditor, audit_date, status)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      audit_id, audit_name, dept_audited, auditor, audit_date, status,
    ]);
    res.json({ success: true, audit: result.rows[0] });
  } catch (error) {
    console.error("Insert audit error:", error);
    res.status(500).json({ success: false, message: "Failed to add audit." });
  }
});

// =================== INCIDENT ROUTES ===================
app.get("/api/incidents", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM incidents ORDER BY incident_id ASC");
    const formattedRows = result.rows.map((row) => ({
      ...row,
      date_reported: row.date_reported
        ? row.date_reported.toISOString().split("T")[0]
        : null,
    }));
    res.json(formattedRows);
  } catch (error) {
    console.error("Fetch incidents error:", error);
    res.status(500).json({ error: "Database query failed" });
  }
});

app.post("/submit-incident", upload.single("evidence"), async (req, res) => {
  const { incidentType, severity, date, department, description } = req.body;
  const evidenceFile = req.file ? req.file.filename : null;
  try {
    await pool.query(
      `INSERT INTO incidents 
      (incident_type, severity_level, date_reported, department, description, evidence, status) 
      VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
      [incidentType, severity, date, department, description, evidenceFile]
    );
    res.redirect("/incident.html");
  } catch (error) {
    console.error("Insert incident error:", error);
    res.status(500).send("Database insert failed");
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
