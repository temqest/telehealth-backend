const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const { corsOptions } = require('./config/cors');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pms-telehealth-backend' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pms-telehealth-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: { state: mongoose.connection.readyState },
  });
});

app.use((req, res) => {
  res.status(404).json({ status: 'fail', message: `Route ${req.originalUrl} not found` });
});

module.exports = app;
