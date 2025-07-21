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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", // Allow inline scripts for development
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", // Allow inline styles
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "https:"
      ],
      connectSrc: [
        "'self'",
        "http://localhost:5000" // Allow API calls
      ]
    },
  },
}));
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
/*const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 50 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter); */

// DB CONNECT
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
  module.exports = mongoose;

// STATIC 
  app.use(express.static(path.join(__dirname, 'interfaces')));
  app.use('/images', express.static(path.join(__dirname, 'interfaces', 'images')));

// ROUTES
  // root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'interfaces', 'landing-page.html'));
  });

  // API ROUTES
  const userRoutes = require('./routes/user.routes');
  const classSessionRoutes = require('./routes/classSessions.routes');
  const classTypeRoutes = require('./routes/classTypes.routes');
  const instructorRoutes = require('./routes/instructors.routes');
  const packageRoutes = require('./routes/packages.routes');
  const purchaseRoutes = require('./routes/purchases.routes');
  const reservationRoutes = require('./routes/reservations.routes');

  // Mount API routes
  app.use('/api/users', userRoutes);
  app.use('/api/class-sessions', classSessionRoutes);
  app.use('/api/class-types', classTypeRoutes);
  app.use('/api/instructors', instructorRoutes);
  app.use('/api/packages', packageRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/reservations', reservationRoutes);


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