'use strict';

const { fail } = require('../utils/errors');
const { query, withTransaction } = require('../utils/db');
const { pagination, paginated } = require('../utils/pagination');
const { audit } = require('../services/audit');
const { generateSchedules } = require('../services/medication');
const { loadDoctorProfile, loadPatientProfile, requireConsultationWindow } = require('../services/access');
const { sendMail } = require('../services/mail');

function cleanMedicines(medicines) {
  const list = Array.isArray(medicines) ? medicines : [];
  if (!list.length) fail(400, 'INVALID', 'Add at least one medicine to issue a prescription.');
  const cleaned = list.map((item) => ({
    medicine_name: String(item.medicine_name || '').trim(),
    dosage: String(item.dosage || '').trim(),
    frequency: String(item.frequency || '').trim(),
    duration: String(item.duration || '').trim(),
    route: String(item.route || 'oral').trim(),
    instructions: String(item.instructions || '').trim()
  }));
  if (cleaned.some((item) => !item.medicine_name || !item.dosage || !item.frequency || !item.duration)) {
    fail(400, 'INVALID', 'Each medicine needs a name, dosage, frequency, and duration.');
  }
  return cleaned;
}

async function issuePrescription(req, consultationId, body) {
  const { rows } = await query(
    `SELECT c.*, a.id AS appointment_id
     FROM consultations c
     JOIN appointments a ON a.id = c.appointment_id
     WHERE c.id = $1`,
    [consultationId]
  );
  const consultation = rows[0];
  if (!consultation) fail(404, 'NOT_FOUND', 'Consultation not found.');
  await requireConsultationWindow(consultation.appointment_id, req.user.id);
  const doctor = await loadDoctorProfile(req.user.id);
  if (doctor.id !== consultation.doctor_id) {
    fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
  }
  const cleaned = cleanMedicines(body?.medicines);
  const names = cleaned.map((item) => item.medicine_name).join(', ');

  const created = await withTransaction(async (client) => {
    const rx = await client.query(
      `INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, notes, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [consultation.id, consultation.patient_id, consultation.doctor_id, body?.notes || null]
    );
    const prescription = rx.rows[0];
    const medicineRows = [];
    for (const item of cleaned) {
      const med = await client.query(
        `INSERT INTO prescription_medicines
           (prescription_id, medicine_name, dosage, frequency, duration, route, instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          prescription.id,
          item.medicine_name,
          item.dosage,
          item.frequency,
          item.duration,
          item.route,
          item.instructions || null
        ]
      );
      medicineRows.push(med.rows[0]);
      await generateSchedules(client, {
        patientId: consultation.patient_id,
        medicineId: med.rows[0].id,
        frequency: item.frequency,
        duration: item.duration
      });
    }

    await client.query(
      `INSERT INTO medical_history (patient_id, consultation_id, prescription_id, record_type, summary)
       VALUES ($1, $2, $3, 'prescription', $4)`,
      [
        consultation.patient_id,
        consultation.id,
        prescription.id,
        `Prescription issued with ${cleaned.length} medicine${cleaned.length === 1 ? '' : 's'}.`
      ]
    );
    await client.query(
      `UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [consultation.appointment_id]
    );

    const patientUser = await client.query(`SELECT user_id FROM patient_profiles WHERE id = $1`, [
      consultation.patient_id
    ]);
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
       VALUES ($1, 'prescription_available', 'New Prescription Available', $2, 'prescription', $3)`,
      [
        patientUser.rows[0].user_id,
        `New prescription available: ${names}. Your medication schedule has been created automatically.`,
        prescription.id
      ]
    );

    return { prescription, medicines: medicineRows, patientUserId: patientUser.rows[0].user_id };
  });

  await audit(req, 'CREATE_PRESCRIPTION', 'prescription', created.prescription.id);
  await audit(req, 'ISSUE_PRESCRIPTION', 'prescription', created.prescription.id);
  const patient = await query(`SELECT email FROM users WHERE id = $1`, [created.patientUserId]);
  await sendMail({
    to: patient.rows[0].email,
    subject: 'New Prescription Available',
    text: 'A new prescription is available in your MediCare+ account. Sign in to view your medicines and schedule.'
  });
  return { ...created.prescription, medicines: created.medicines };
}

async function create(req, res) {
  const consultationId = req.body?.consultation_id;
  if (!consultationId) fail(400, 'INVALID', 'A consultation is required to issue a prescription.');
  const prescription = await issuePrescription(req, consultationId, req.body);
  res.status(201).json({ success: true, data: { prescription } });
}

async function createForConsultation(req, res) {
  const prescription = await issuePrescription(req, req.params.id, req.body);
  res.status(201).json({ success: true, data: { prescription } });
}

async function attachMedicines(rows) {
  const ids = rows.map((row) => row.id);
  if (!ids.length) return rows.map((row) => ({ ...row, medicines: [] }));
  const meds = await query(
    `SELECT * FROM prescription_medicines WHERE prescription_id = ANY($1::uuid[]) ORDER BY created_at`,
    [ids]
  );
  return rows.map((row) => ({
    ...row,
    medicines: meds.rows.filter((item) => item.prescription_id === row.id)
  }));
}

async function list(req, res) {
  const { page, limit, offset } = pagination(req);
  const activeOnly = String(req.query.active || '') === '1';
  let total;
  let rows;
  if (req.user.role === 'patient') {
    const profile = await loadPatientProfile(req.user.id);
    const extra = activeOnly ? `AND p.status = 'active'` : '';
    const count = await query(
      `SELECT COUNT(*)::int AS n FROM prescriptions p WHERE p.patient_id = $1 ${extra}`,
      [profile.id]
    );
    total = count.rows[0].n;
    const result = await query(
      `SELECT p.*, u.name AS doctor_name
       FROM prescriptions p
       JOIN doctor_profiles dp ON dp.id = p.doctor_id
       JOIN users u ON u.id = dp.user_id
       WHERE p.patient_id = $1 ${extra}
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [profile.id, limit, offset]
    );
    rows = result.rows;
  } else if (req.user.role === 'doctor') {
    const profile = await loadDoctorProfile(req.user.id);
    const count = await query(`SELECT COUNT(*)::int AS n FROM prescriptions WHERE doctor_id = $1`, [profile.id]);
    total = count.rows[0].n;
    const result = await query(
      `SELECT p.*, u.name AS patient_name
       FROM prescriptions p
       JOIN patient_profiles pp ON pp.id = p.patient_id
       JOIN users u ON u.id = pp.user_id
       WHERE p.doctor_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [profile.id, limit, offset]
    );
    rows = result.rows;
  } else {
    fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  }
  res.json({ success: true, data: paginated(await attachMedicines(rows), total, { page, limit }) });
}

module.exports = { create, createForConsultation, list, issuePrescription };
