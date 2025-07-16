// STARTING FILE FOR SERVER. TO RUN, TYPE 'node server.js' 
require('dotenv').config(); // Load environment variables first
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const https = require('https');
const fs = require('fs');

// SECURITY
app.use(helmet()); // Sets various security headers
app.use(express.json({ limit: '10kb' })); // Limit JSON payload size

// CORS CONFIG (deepseek enhanced)
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_PROD_URL 
    : 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// RATE LIMITING
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// DB CONNECT
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
  module.exports = mongoose;

// STATIC 
  app.use(express.static(path.join(__dirname, 'interfaces')));

// ROUTES
  // root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'interfaces', 'landing-page.html'));
  });
  // api routes
  const userRoutes = require('./routes/user.routes');
  app.use('/api/users', userRoutes);

  app.use((err, req, res, next) => { // Basic error handling
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  
  // START SERVER ON PORT 5000
  const PORT = process.env.PORT || 5000;

  // HTTPS CERTS (dev, not for profuction)
  const httpsOptions = {
    key: fs.readFileSync('./certs/localhost-key.pem'),
    cert: fs.readFileSync('./certs/localhost.pem')
};

  // PRODUCTION AND DEV SERVER SETUP (deepseek enhanced)
  if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    minVersion: 'TLSv1.2' // Enforce modern TLS
  };
  
  https.createServer(httpsOptions, app).listen(443, () => {
    console.log('HTTPS server running on port 443');
  });
  } else {
    app.listen(PORT, () => {
      console.log(`HTTP server running on port ${PORT}`);
      console.log(`HTTP server running on http://localhost:${PORT}`);
    });
  } 

  // debug endpoint test
  app.get('/api/ping', (req, res) => {
    res.json({ message: 'Backend activated' });
    console.log('Ping received from frontend!');
  });