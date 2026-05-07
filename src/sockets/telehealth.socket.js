const {
  assertCanJoinAppointment,
  publicAppointmentFields,
  staffRoles,
} = require('../services/appointmentAccess');
const {
  addPatientSocket,
  clearActiveCall,
  getActiveCall,
  getCallTimeoutMs,
  getPatientSocketCount,
  patientRoomName,
  removeSocket: removeCallSocket,
  setActiveCall,
} = require('../services/callStore');
const {
  addSocketToRoom,
  getRoomPeerCount,
  getSocketRoom,
  removeSocket: removeRoomSocket,
} = require('../services/roomStore');

const emitRoomError = (socket, message, statusCode = 400) => {
  socket.emit('room:error', { message, statusCode });
};

const safeUserSummary = (user = {}) => ({
  id: user.sub || '',
  role: user.role || '',
  patient_id: user.patient_id || null,
});

const callerInfo = (socket) => ({
  id: socket.user?.sub || socket.id,
  role: socket.user?.role || '',
  fullName: socket.user?.fullName || 'Clinic staff',
});

const forwardToPeer = (socket, eventName, payload) => {
  const roomName = getSocketRoom(socket.id);
  if (!roomName) {
    emitRoomError(socket, 'Join a telehealth room before signaling.');
    return;
  }

  socket.to(roomName).emit(eventName, payload);
};

const emitCallExpired = (io, appointmentId) => {
  const call = clearActiveCall(appointmentId);
  if (!call || call.status !== 'pending') return;

  const payload = {
    appointmentId,
    callId: call.callId,
    appointment: call.appointment,
    message: 'Telehealth call invitation expired.',
  };

  io.to(call.staffSocketId).emit('call-expired', payload);
  io.to(patientRoomName(call.appointment.patient_id)).emit('call-expired', payload);
  console.log('[telehealth] call expired', {
    appointment_id: appointmentId,
    patient_id: call.appointment.patient_id,
  });
};

const initiateCall = async (io, socket, payload = {}) => {
  const appointment = await assertCanJoinAppointment(payload.appointmentId, socket.user);
  if (!staffRoles.has(socket.user?.role)) {
    const err = new Error('Only clinic staff can initiate telehealth calls.');
    err.statusCode = 403;
    throw err;
  }

  const appointmentPayload = publicAppointmentFields(appointment);
  const appointmentId = appointment.appointment_id;
  const patientOnline = getPatientSocketCount(appointment.patient_id) > 0;
  const timeoutMs = getCallTimeoutMs();
  const expiresAt = new Date(Date.now() + timeoutMs).toISOString();
  const callId = `call:${appointmentId}:${Date.now()}`;

  const call = setActiveCall(appointmentId, {
    callId,
    staffSocketId: socket.id,
    status: 'pending',
    appointment: appointmentPayload,
    caller: callerInfo(socket),
    expiresAt,
    timer: setTimeout(() => emitCallExpired(io, appointmentId), timeoutMs),
  });

  const eventPayload = {
    appointmentId,
    callId,
    appointment: appointmentPayload,
    caller: call.caller,
    patientOnline,
    expiresAt,
  };

  socket.emit('call-initiated', eventPayload);
  io.to(patientRoomName(appointment.patient_id)).emit('incoming-call', eventPayload);

  if (!patientOnline) {
    socket.emit('call-patient-offline', {
      ...eventPayload,
      message: 'Patient is not connected to the portal right now.',
    });
  }

  console.log('[telehealth] call initiated', {
    appointment_id: appointmentId,
    patient_id: appointment.patient_id,
    staff: safeUserSummary(socket.user),
    patientOnline,
  });
};

const respondToCall = async (io, socket, payload = {}, accepted) => {
  const appointment = await assertCanJoinAppointment(payload.appointmentId, socket.user);
  if (socket.user?.role !== 'patient' || socket.user?.patient_id !== appointment.patient_id) {
    const err = new Error('Only the assigned patient can respond to this call.');
    err.statusCode = 403;
    throw err;
  }

  const call = getActiveCall(appointment.appointment_id);
  if (!call) {
    socket.emit('call-expired', {
      appointmentId: appointment.appointment_id,
      message: 'This telehealth call is no longer active.',
    });
    return;
  }

  clearActiveCall(appointment.appointment_id);
  const eventName = accepted ? 'call-accepted' : 'call-rejected';
  const eventPayload = {
    appointmentId: appointment.appointment_id,
    callId: call.callId,
    appointment: call.appointment,
    patient: {
      patient_id: socket.user.patient_id,
      fullName: socket.user.fullName || appointment.patient_name,
    },
  };

  io.to(call.staffSocketId).emit(eventName, eventPayload);
  socket.emit(eventName, eventPayload);

  console.log(`[telehealth] call ${accepted ? 'accepted' : 'rejected'}`, {
    appointment_id: appointment.appointment_id,
    patient_id: appointment.patient_id,
  });
};

const joinTelehealthRoom = async (io, socket, payload = {}) => {
  const appointment = await assertCanJoinAppointment(payload.appointmentId, socket.user);
  const appointmentId = appointment.appointment_id;
  if (getRoomPeerCount(appointmentId) >= 2) {
    emitRoomError(socket, 'This telehealth room already has two participants.', 409);
    return;
  }

  const { roomName, peerCount } = addSocketToRoom(socket.id, appointmentId);

  await socket.join(roomName);

  socket.emit('room:joined', {
    appointmentId,
    peerCount,
    user: {
      role: socket.user?.role,
      patient_id: socket.user?.patient_id || null,
      fullName: socket.user?.fullName || '',
    },
    appointment: publicAppointmentFields(appointment),
  });

  console.log('[telehealth] room joined', {
    appointment_id: appointmentId,
    socket_id: socket.id,
    peerCount,
    user: safeUserSummary(socket.user),
  });

  socket.to(roomName).emit('peer:joined', {
    socketId: socket.id,
    peerCount,
    role: socket.user?.role,
  });

  if (peerCount >= 2) {
    io.to(roomName).emit('room:ready', { initiatorSocketId: socket.id, peerCount });
  }
};

const leaveTelehealthRoom = (socket) => {
  const roomName = removeRoomSocket(socket.id);
  if (!roomName) return;
  socket.leave(roomName);
  socket.to(roomName).emit('peer:left', { socketId: socket.id });
};

const endTelehealthCall = (io, socket, payload = {}) => {
  const call = clearActiveCall(payload.appointmentId);
  if (call?.appointment?.patient_id) {
    io.to(patientRoomName(call.appointment.patient_id)).emit('call-ended', {
      appointmentId: payload.appointmentId,
      callId: call.callId,
    });
  }

  const roomName = getSocketRoom(socket.id);
  if (roomName) {
    socket.to(roomName).emit('call:ended', { ...payload, socketId: socket.id });
    socket.to(roomName).emit('call-ended', { ...payload, socketId: socket.id });
  }
  leaveTelehealthRoom(socket);

  console.log('[telehealth] call ended', {
    appointment_id: payload.appointmentId,
    user: safeUserSummary(socket.user),
  });
};

const registerTelehealthSocket = (io) => {
  io.on('connection', (socket) => {
    const userSummary = safeUserSummary(socket.user);
    if (socket.user?.sub) {
      socket.join(`user:${socket.user.sub}`);
    }

    if (socket.user?.role === 'patient' && socket.user?.patient_id) {
      addPatientSocket(socket.user.patient_id, socket.id);
      socket.join(patientRoomName(socket.user.patient_id));
      socket.emit('user-online', { role: 'patient', patient_id: socket.user.patient_id });
    } else if (socket.user?.sub) {
      socket.join(`staff:${socket.user.sub}`);
      socket.emit('user-online', { role: socket.user?.role || 'staff' });
    }

    console.log('[telehealth] socket connected', {
      socket_id: socket.id,
      user: userSummary,
    });

    socket.on('initiate-call', async (payload = {}) => {
      try {
        await initiateCall(io, socket, payload);
      } catch (err) {
        socket.emit('call-error', {
          message: err.message || 'Unable to initiate telehealth call.',
          statusCode: err.statusCode || 500,
        });
      }
    });

    socket.on('accept-call', async (payload = {}) => {
      try {
        await respondToCall(io, socket, payload, true);
      } catch (err) {
        socket.emit('call-error', {
          message: err.message || 'Unable to accept telehealth call.',
          statusCode: err.statusCode || 500,
        });
      }
    });

    socket.on('reject-call', async (payload = {}) => {
      try {
        await respondToCall(io, socket, payload, false);
      } catch (err) {
        socket.emit('call-error', {
          message: err.message || 'Unable to reject telehealth call.',
          statusCode: err.statusCode || 500,
        });
      }
    });

    socket.on('room:join', async (payload = {}) => {
      try {
        await joinTelehealthRoom(io, socket, payload);
      } catch (err) {
        emitRoomError(socket, err.message || 'Unable to join telehealth room.', err.statusCode || 500);
      }
    });

    socket.on('join-room', async (payload = {}) => {
      try {
        await joinTelehealthRoom(io, socket, payload);
      } catch (err) {
        emitRoomError(socket, err.message || 'Unable to join telehealth room.', err.statusCode || 500);
      }
    });

    socket.on('room:leave', () => {
      leaveTelehealthRoom(socket);
    });

    socket.on('leave-room', () => {
      leaveTelehealthRoom(socket);
    });

    socket.on('room:ready', (payload = {}) => {
      forwardToPeer(socket, 'room:ready', { ...payload, socketId: socket.id });
    });

    socket.on('webrtc:offer', (payload = {}) => {
      forwardToPeer(socket, 'webrtc:offer', { ...payload, from: socket.id });
    });

    socket.on('webrtc:answer', (payload = {}) => {
      forwardToPeer(socket, 'webrtc:answer', { ...payload, from: socket.id });
    });

    socket.on('webrtc:ice-candidate', (payload = {}) => {
      forwardToPeer(socket, 'webrtc:ice-candidate', { ...payload, from: socket.id });
    });

    socket.on('call:end', (payload = {}) => {
      endTelehealthCall(io, socket, payload);
    });

    socket.on('call-ended', (payload = {}) => {
      endTelehealthCall(io, socket, payload);
    });

    socket.on('disconnect', () => {
      const patientId = removeCallSocket(socket.id);
      if (patientId) {
        socket.to(patientRoomName(patientId)).emit('user-offline', { role: 'patient', patient_id: patientId });
      }

      const roomName = removeRoomSocket(socket.id);
      if (roomName) {
        socket.to(roomName).emit('peer:left', { socketId: socket.id });
      }

      console.log('[telehealth] socket disconnected', {
        socket_id: socket.id,
        user: userSummary,
      });
    });
  });
};

module.exports = registerTelehealthSocket;
