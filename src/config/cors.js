const parseOrigins = () => {
  const raw =
    process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_ORIGIN ||
    process.env.CORS_ALLOWED_ORIGINS ||
    '';
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
};

const allowedOrigins = parseOrigins();
const allowAllOrigins = process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0;

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = origin.replace(/\/$/, '');
  return allowAllOrigins || allowedOrigins.includes(normalizedOrigin);
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  originDescription: allowAllOrigins ? 'all development origins' : allowedOrigins.join(', '),
};

const socketCorsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Socket.IO origin not allowed: ${origin}`));
  },
  methods: ['GET', 'POST'],
  credentials: true,
};

module.exports = {
  allowedOrigins,
  corsOptions,
  socketCorsOptions,
};
