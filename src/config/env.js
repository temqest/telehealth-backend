const required = ['JWT_SECRET', 'MONGO_URI'];

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});
