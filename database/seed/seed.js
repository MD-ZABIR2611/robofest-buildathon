'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('../../server/utils/db');

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || 'DemoPass123!';

async function upsertUser({ name, email, role, verified = true }) {
  const existing = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  if (existing.rows[0]) {
    await query(
      `UPDATE users SET name = $1, role = $2, email_verified = $3, is_active = TRUE, password_hash = $4, updated_at = NOW()
       WHERE id = $5`,
      [name, role, verified, hash, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, email_verified)
     VALUES ($1, LOWER($2), $3, $4, $5)
     RETURNING id`,
    [name, email, hash, role, verified]
  );
  return rows[0].id;
}

async function seed() {
  const patientUserId = await upsertUser({
    name: 'Amina Rahman',
    email: 'patient@medicare.local',
    role: 'patient'
  });
  const doctorUserId = await upsertUser({
    name: 'Dr. Samuel Ortega',
    email: 'doctor@medicare.local',
    role: 'doctor'
  });
  const doctorTwoId = await upsertUser({
    name: 'Dr. Leila Hassan',
    email: 'doctor2@medicare.local',
    role: 'doctor'
  });
  const doctorThreeId = await upsertUser({
    name: 'Dr. Priya Nair',
    email: 'doctor3@medicare.local',
    role: 'doctor'
  });

  await query(
    `INSERT INTO patient_profiles (user_id, date_of_birth, phone, address, emergency_contact_name, emergency_contact_phone)
     VALUES ($1, '1992-04-18', '+1 555 0142', '18 Harbor Lane', 'Nadia Rahman', '+1 555 0199')
     ON CONFLICT (user_id) DO UPDATE SET
       date_of_birth = EXCLUDED.date_of_birth,
       phone = EXCLUDED.phone,
       address = EXCLUDED.address,
       emergency_contact_name = EXCLUDED.emergency_contact_name,
       emergency_contact_phone = EXCLUDED.emergency_contact_phone`,
    [patientUserId]
  );

  async function upsertDoctor(userId, fields) {
    const existing = await query(`SELECT id FROM doctor_profiles WHERE user_id = $1`, [userId]);
    if (existing.rows[0]) {
      await query(
        `UPDATE doctor_profiles
         SET specialization = $1, license_number = $2, qualification = $3, experience_years = $4,
             bio = $5, verification_status = 'verified', consultation_fee = $6, updated_at = NOW()
         WHERE user_id = $7`,
        [fields.specialization, fields.license, fields.qualification, fields.years, fields.bio, fields.fee, userId]
      );
      return existing.rows[0].id;
    }
    const { rows } = await query(
      `INSERT INTO doctor_profiles
         (user_id, specialization, license_number, qualification, experience_years, bio, verification_status, consultation_fee)
       VALUES ($1, $2, $3, $4, $5, $6, 'verified', $7)
       RETURNING id`,
      [userId, fields.specialization, fields.license, fields.qualification, fields.years, fields.bio, fields.fee]
    );
    return rows[0].id;
  }

  const doctorId = await upsertDoctor(doctorUserId, {
    specialization: 'Internal Medicine',
    license: 'MD-44021',
    qualification: 'MD, FACP',
    years: 14,
    bio: 'Evidence-based adult medicine with a calm, collaborative consultation style.',
    fee: 85
  });
  const doctorB = await upsertDoctor(doctorTwoId, {
    specialization: 'Family Medicine',
    license: 'MD-33811',
    qualification: 'MBBS, MRCGP',
    years: 9,
    bio: 'Whole-person primary care, preventive health, and chronic condition follow-up.',
    fee: 70
  });
  const doctorC = await upsertDoctor(doctorThreeId, {
    specialization: 'Endocrinology',
    license: 'MD-22904',
    qualification: 'MD, Endocrinology',
    years: 11,
    bio: 'Thyroid, diabetes, and metabolic care with clear medication plans.',
    fee: 95
  });

  for (const id of [doctorId, doctorB, doctorC]) {
    await query(`DELETE FROM doctor_availability WHERE doctor_id = $1`, [id]);
    for (const day of [1, 2, 3, 4, 5]) {
      await query(
        `INSERT INTO doctor_availability
           (doctor_id, day_of_week, start_time, end_time, appointment_duration, appointment_type)
         VALUES ($1, $2, '09:00', '17:00', 30, 'Video')`,
        [id, day]
      );
    }
    await query(
      `INSERT INTO doctor_availability
         (doctor_id, day_of_week, start_time, end_time, appointment_duration, appointment_type)
       VALUES ($1, 6, '09:00', '13:00', 30, 'Video')`,
      [id]
    );
  }

  const patient = await query(`SELECT id FROM patient_profiles WHERE user_id = $1`, [patientUserId]);
  const patientId = patient.rows[0].id;

  const now = new Date();
  const startCurrent = new Date(now.getTime() - 5 * 60000);
  const endCurrent = new Date(now.getTime() + 25 * 60000);
  const startFuture = new Date(now.getTime() + 24 * 60 * 60000);
  startFuture.setMinutes(0, 0, 0);
  const endFuture = new Date(startFuture.getTime() + 30 * 60000);
  const startPast = new Date(now.getTime() - 26 * 60 * 60000);
  const endPast = new Date(startPast.getTime() + 30 * 60000);

  await query(
    `DELETE FROM notifications WHERE user_id = $1 AND title LIKE 'Demo:%'`,
    [patientUserId]
  );
  await query(
    `DELETE FROM medical_history WHERE patient_id = $1 AND summary LIKE 'Demo:%'`,
    [patientId]
  );
  await query(`DELETE FROM prescriptions WHERE patient_id = $1 AND notes LIKE 'Demo:%'`, [patientId]);
  await query(
    `DELETE FROM consultations WHERE appointment_id IN (
       SELECT id FROM appointments WHERE patient_id = $1 AND reason LIKE 'Demo:%'
     )`,
    [patientId]
  );
  await query(`DELETE FROM appointments WHERE patient_id = $1 AND reason LIKE 'Demo:%'`, [patientId]);

  async function insertAppt({ start, end, status, reason, doctor }) {
    const stamp = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    try {
      await query(
        `INSERT INTO appointments
           (patient_id, doctor_id, appointment_date, appointment_start, appointment_end, type, reason, status)
         VALUES ($1, $2, $3, $4, $5, 'Video', $6, $7)`,
        [patientId, doctor, stamp, start.toISOString(), end.toISOString(), reason, status]
      );
    } catch (err) {
      if (err.code !== '23P01') throw err;
    }
  }

  await insertAppt({
    start: startCurrent,
    end: endCurrent,
    status: 'confirmed',
    reason: 'Demo: live consultation window',
    doctor: doctorId
  });
  await insertAppt({
    start: startFuture,
    end: endFuture,
    status: 'confirmed',
    reason: 'Demo: future appointment',
    doctor: doctorB
  });
  await insertAppt({
    start: startPast,
    end: endPast,
    status: 'completed',
    reason: 'Demo: ended window',
    doctor: doctorC
  });

  await upsertUser({
    name: 'MediCare Admin',
    email: 'admin@medicare.local',
    role: 'admin'
  });

  const { generateSchedules } = require('../../server/services/medication');
  const pastAppt = await query(
    `SELECT id FROM appointments
     WHERE patient_id = $1 AND reason = 'Demo: ended window'
     ORDER BY appointment_start DESC LIMIT 1`,
    [patientId]
  );
  if (pastAppt.rows[0]) {
    await query(
      `DELETE FROM notifications WHERE user_id = $1 AND title LIKE 'Demo:%'`,
      [patientUserId]
    );
    await query(
      `DELETE FROM medical_history WHERE patient_id = $1 AND summary LIKE 'Demo:%'`,
      [patientId]
    );
    await query(
      `DELETE FROM prescriptions WHERE patient_id = $1 AND notes LIKE 'Demo:%'`,
      [patientId]
    );
    await query(`DELETE FROM consultations WHERE appointment_id = $1`, [pastAppt.rows[0].id]);

    const consult = await query(
      `INSERT INTO consultations
         (appointment_id, patient_id, doctor_id, symptoms, chief_complaint, diagnosis, doctor_notes, treatment_plan, follow_up_instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        pastAppt.rows[0].id,
        patientId,
        doctorC,
        'Occasional headache and thirst',
        'Routine chronic-care review',
        'Type 2 diabetes mellitus; essential hypertension',
        'Blood pressure 132/84. Continue current plan with closer home logging.',
        'Metformin, amlodipine, and vitamin D as written.',
        'Recheck labs in 12 weeks.'
      ]
    );
    const consultationId = consult.rows[0].id;
    const rx = await query(
      `INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, notes, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id`,
      [consultationId, patientId, doctorC, 'Demo: home medication plan']
    );
    const prescriptionId = rx.rows[0].id;
    const meds = [
      {
        name: 'Metformin',
        dosage: '500 mg',
        frequency: 'twice daily',
        duration: '7 days',
        instructions: 'Take with meals'
      },
      {
        name: 'Amlodipine',
        dosage: '5 mg',
        frequency: 'once daily',
        duration: '7 days',
        instructions: 'Take in the morning'
      },
      {
        name: 'Vitamin D3',
        dosage: '1000 IU',
        frequency: 'once daily',
        duration: '7 days',
        instructions: 'Take with breakfast'
      }
    ];
    for (const med of meds) {
      const row = await query(
        `INSERT INTO prescription_medicines
           (prescription_id, medicine_name, dosage, frequency, duration, route, instructions)
         VALUES ($1, $2, $3, $4, $5, 'oral', $6)
         RETURNING id`,
        [prescriptionId, med.name, med.dosage, med.frequency, med.duration, med.instructions]
      );
      await generateSchedules(
        { query },
        {
          patientId,
          medicineId: row.rows[0].id,
          frequency: med.frequency,
          duration: med.duration
        }
      );
    }
    const soon = new Date(Date.now() + 12 * 60000);
    const soonDate = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
    const soonTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}:00`;
    const firstMed = await query(
      `SELECT id FROM prescription_medicines WHERE prescription_id = $1 ORDER BY created_at LIMIT 1`,
      [prescriptionId]
    );
    if (firstMed.rows[0]) {
      await query(
        `INSERT INTO medication_schedules
           (patient_id, prescription_medicine_id, scheduled_date, scheduled_time, status)
         VALUES ($1, $2, $3, $4, 'upcoming')
         ON CONFLICT (prescription_medicine_id, scheduled_date, scheduled_time) DO UPDATE SET status = 'upcoming'`,
        [patientId, firstMed.rows[0].id, soonDate, soonTime]
      );
    }
    const history = [
      ['consultation', 'Demo: Follow-up for type 2 diabetes and hypertension. BP 132/84. Continue oral therapy.'],
      ['allergy', 'Demo: Documented rash with penicillin. Avoid beta-lactam antibiotics unless supervised.'],
      ['lab', 'Demo: HbA1c 7.1%. Fasting glucose 118 mg/dL. Repeat in 12 weeks.'],
      ['prescription', 'Demo: Metformin 500 mg twice daily, amlodipine 5 mg daily, vitamin D3 1000 IU daily.']
    ];
    for (const [type, summary] of history) {
      await query(
        `INSERT INTO medical_history (patient_id, consultation_id, prescription_id, record_type, summary)
         VALUES ($1, $2, $3, $4, $5)`,
        [patientId, consultationId, prescriptionId, type, summary]
      );
    }
    await query(
      `INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
       VALUES
         ($1, 'prescription_available', 'Demo: New prescription', 'Metformin, amlodipine, and vitamin D were added to your medication timer.', 'prescription', $2),
         ($1, 'medication_reminder', 'Demo: Next dose', 'Your next Metformin dose is on the medication timer.', 'prescription', $2)`,
      [patientUserId, prescriptionId]
    );
  }

  const { makeAllDoctorsBookable } = require('../../server/services/clinicHours');
  await makeAllDoctorsBookable();

  console.log('Seed complete.');
  console.log('Patient:  patient@medicare.local /', DEMO_PASSWORD);
  console.log('Doctor:   doctor@medicare.local /', DEMO_PASSWORD);
  console.log('Admin:    admin@medicare.local /', DEMO_PASSWORD);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
