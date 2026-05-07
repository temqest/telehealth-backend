const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    appointment_id: { type: String, required: true, unique: true },
    patient_id: { type: String, required: true },
    patient_name: { type: String, default: '' },
    appointment_type: { type: String, default: 'In-Person' },
    scheduled_at: { type: Date },
    duration_minutes: { type: Number, default: 30 },
    reason: { type: String, default: '' },
    status: { type: String, default: 'Pending' },
  },
  {
    collection: 'appointments',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Appointment =
  mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);

const staffRoles = new Set([
  'system_admin',
  'front_desk',
  'physician',
  'appointment_system',
]);

const assertCanJoinAppointment = async (appointmentId, user) => {
  const normalizedAppointmentId = String(appointmentId || '').trim();
  if (!normalizedAppointmentId) {
    const err = new Error('appointmentId is required.');
    err.statusCode = 400;
    throw err;
  }

  const appointment = await Appointment.findOne({ appointment_id: normalizedAppointmentId }).lean();
  if (!appointment) {
    const err = new Error('Telehealth appointment not found.');
    err.statusCode = 404;
    throw err;
  }

  if (appointment.appointment_type !== 'Telehealth') {
    const err = new Error('This appointment is not a telehealth visit.');
    err.statusCode = 409;
    throw err;
  }

  if (staffRoles.has(user?.role)) {
    return appointment;
  }

  if (user?.role === 'patient' && user?.patient_id && user.patient_id === appointment.patient_id) {
    return appointment;
  }

  const err = new Error('You are not allowed to join this telehealth room.');
  err.statusCode = 403;
  throw err;
};

module.exports = {
  assertCanJoinAppointment,
};
