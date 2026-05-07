const socketRooms = new Map();
const roomMembers = new Map();

const roomNameForAppointment = (appointmentId) => `appointment:${appointmentId}`;

const addSocketToRoom = (socketId, appointmentId) => {
  const roomName = roomNameForAppointment(appointmentId);
  socketRooms.set(socketId, roomName);

  const members = roomMembers.get(roomName) || new Set();
  members.add(socketId);
  roomMembers.set(roomName, members);

  return {
    roomName,
    peerCount: members.size,
  };
};

const removeSocket = (socketId) => {
  const roomName = socketRooms.get(socketId);
  if (!roomName) return null;

  socketRooms.delete(socketId);
  const members = roomMembers.get(roomName);
  if (members) {
    members.delete(socketId);
    if (members.size === 0) {
      roomMembers.delete(roomName);
    }
  }

  return roomName;
};

const getSocketRoom = (socketId) => socketRooms.get(socketId) || null;

const getRoomPeerCount = (appointmentId) => {
  const roomName = roomNameForAppointment(appointmentId);
  return roomMembers.get(roomName)?.size || 0;
};

module.exports = {
  addSocketToRoom,
  getRoomPeerCount,
  getSocketRoom,
  removeSocket,
  roomNameForAppointment,
};
