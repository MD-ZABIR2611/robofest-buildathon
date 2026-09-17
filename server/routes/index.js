'use strict';

const authRoutes = require('./auth');
const doctorDirectoryRoutes = require('./doctors');
const appointmentRoutes = require('./appointments');
const clinicalRoutes = require('./clinical');
const patientRoutes = require('./patient');
const doctorRoutes = require('./doctor');
const notificationRoutes = require('./notifications');
const prescriptionRoutes = require('./prescriptionRoutes');
const medicationRoutes = require('./medicationRoutes');
const adminRoutes = require('./admin');
const jobRoutes = require('./jobs');
const { apiLimiter } = require('../middleware/rateLimit');

function mountApi(app) {
  app.get('/api/health', (req, res) => {
    res.json({ success: true, data: { ok: true } });
  });
  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/doctors', doctorDirectoryRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api', clinicalRoutes);
  app.use('/api/patient', patientRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/prescriptions', prescriptionRoutes);
  app.use('/api/medications', medicationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/jobs', jobRoutes);
}

module.exports = { mountApi };
