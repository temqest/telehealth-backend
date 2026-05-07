const DEFAULT_CALL_TIMEOUT_MS = 90 * 1000;

const patientSockets = new Map();
const socketPatients = new Map();
const activeCalls = new Map();

const getCallTimeoutMs = () => {
  const configured = Number(process.env.CALL_INVITE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CALL_TIMEOUT_MS;
};

const addPatientSocket = (patientId, socketId) => {
  const normalizedPatientId = String(patientId || '').trim();
  if (!normalizedPatientId) return;

  const sockets = patientSockets.get(normalizedPatientId) || new Set();
  sockets.add(socketId);
  patientSockets.set(normalizedPatientId, sockets);
  socketPatients.set(socketId, normalizedPatientId);
};

const removeSocket = (socketId) => {
  const patientId = socketPatients.get(socketId);
  if (!patientId) return null;

  socketPatients.delete(socketId);
  const sockets = patientSockets.get(patientId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      patientSockets.delete(patientId);
    }
  }

  return patientId;
};

const getPatientSocketCount = (patientId) => {
  const normalizedPatientId = String(patientId || '').trim();
  return patientSockets.get(normalizedPatientId)?.size || 0;
};

const patientRoomName = (patientId) => `patient:${patientId}`;

const setActiveCall = (appointmentId, call) => {
  const normalizedAppointmentId = String(appointmentId || '').trim();
  if (!normalizedAppointmentId) return null;

  const previous = activeCalls.get(normalizedAppointmentId);
  if (previous?.timer) {
    clearTimeout(previous.timer);
  }

  activeCalls.set(normalizedAppointmentId, call);
  return call;
};

const getActiveCall = (appointmentId) => activeCalls.get(String(appointmentId || '').trim()) || null;

const clearActiveCall = (appointmentId) => {
  const normalizedAppointmentId = String(appointmentId || '').trim();
  const call = activeCalls.get(normalizedAppointmentId);
  if (call?.timer) {
    clearTimeout(call.timer);
  }
  activeCalls.delete(normalizedAppointmentId);
  return call || null;
};

module.exports = {
  addPatientSocket,
  clearActiveCall,
  getActiveCall,
  getCallTimeoutMs,
  getPatientSocketCount,
  patientRoomName,
  removeSocket,
  setActiveCall,
};
