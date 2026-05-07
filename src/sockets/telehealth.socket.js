const { assertCanJoinAppointment } = require('../services/appointmentAccess');
const { addSocketToRoom, getRoomPeerCount, getSocketRoom, removeSocket } = require('../services/roomStore');

const emitRoomError = (socket, message, statusCode = 400) => {
  socket.emit('room:error', { message, statusCode });
};

const forwardToPeer = (socket, eventName, payload) => {
  const roomName = getSocketRoom(socket.id);
  if (!roomName) {
    emitRoomError(socket, 'Join a telehealth room before signaling.');
    return;
  }

  socket.to(roomName).emit(eventName, payload);
};

const registerTelehealthSocket = (io) => {
  io.on('connection', (socket) => {
    socket.on('room:join', async (payload = {}) => {
      try {
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
          appointment: {
            appointment_id: appointment.appointment_id,
            patient_id: appointment.patient_id,
            patient_name: appointment.patient_name,
            scheduled_at: appointment.scheduled_at,
            duration_minutes: appointment.duration_minutes,
            reason: appointment.reason,
            status: appointment.status,
          },
        });

        socket.to(roomName).emit('peer:joined', {
          socketId: socket.id,
          peerCount,
          role: socket.user?.role,
        });

        if (peerCount >= 2) {
          io.to(roomName).emit('room:ready', { initiatorSocketId: socket.id, peerCount });
        }
      } catch (err) {
        emitRoomError(socket, err.message || 'Unable to join telehealth room.', err.statusCode || 500);
      }
    });

    socket.on('room:leave', () => {
      const roomName = removeSocket(socket.id);
      if (!roomName) return;
      socket.leave(roomName);
      socket.to(roomName).emit('peer:left', { socketId: socket.id });
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
      const roomName = removeSocket(socket.id);
      if (!roomName) return;
      socket.to(roomName).emit('call:ended', { ...payload, socketId: socket.id });
      socket.leave(roomName);
    });

    socket.on('disconnect', () => {
      const roomName = removeSocket(socket.id);
      if (roomName) {
        socket.to(roomName).emit('peer:left', { socketId: socket.id });
      }
    });
  });
};

module.exports = registerTelehealthSocket;
