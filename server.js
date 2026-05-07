require('dotenv').config();
require('./src/config/env');

const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const app = require('./src/app');
const { corsOptions, socketCorsOptions } = require('./src/config/cors');
const { authenticateSocket } = require('./src/middleware/socketAuth');
const registerTelehealthSocket = require('./src/sockets/telehealth.socket');

const PORT = process.env.PORT || 5100;
const server = http.createServer(app);
const io = new Server(server, {
  cors: socketCorsOptions,
});

io.use(authenticateSocket);
registerTelehealthSocket(io);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`PMS Telehealth backend running on port ${PORT} [${process.env.NODE_ENV}]`);
      console.log(`HTTP CORS origins: ${corsOptions.originDescription}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start telehealth backend:', err);
    process.exit(1);
  });
