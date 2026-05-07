const jwt = require('jsonwebtoken');

const authenticateSocket = (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      next(new Error('Authentication token is required.'));
      return;
    }

    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid or expired authentication token.'));
  }
};

module.exports = { authenticateSocket };
