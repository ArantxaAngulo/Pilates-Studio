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

const User = require('./schemas/user.model'); // Load User schema
require('./schemas/purchases.model'); // Load Purchase schema
require('./schemas/packages.model'); // Load Package schema

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

// Trust proxy for Railway (required for rate limiting and real IP detection)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// CORS CONFIG (deepseek enhanced)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5000',
      process.env.FRONTEND_PROD_URL,
      process.env.BASE_URL,
      'https://pilates-studio-production.up.railway.app'
    ].filter(Boolean); // Remove undefined values
    
    // Allow any ngrok URL or Railway URL
    if (origin.includes('ngrok-free.app') || origin.includes('ngrok.io') || origin.includes('railway.app')) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, allow all origins
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

// PAYMENT SCRIPT
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://sdk.mercadopago.com;"
  );
  next();
});

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

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

// STATIC FILES - Serve from public directory in production, interfaces in development
  const staticDir = process.env.NODE_ENV === 'production' ? 'public' : 'interfaces';
  app.use(express.static(path.join(__dirname, staticDir)));
  app.use('/images', express.static(path.join(__dirname, staticDir, 'images')));
  app.use('/interfaces', express.static(path.join(__dirname, staticDir)));

// ROUTES
  // root
  app.get('/', (req, res) => {
    const staticDir = process.env.NODE_ENV === 'production' ? 'public' : 'interfaces';
    res.sendFile(path.join(__dirname, staticDir, 'landing-page.html'));
  });

  // API ROUTES
  const userRoutes = require('./routes/user.routes');
  const classSessionRoutes = require('./routes/classSessions.routes');
  const classTypeRoutes = require('./routes/classTypes.routes');
  const instructorRoutes = require('./routes/instructors.routes');
  const packageRoutes = require('./routes/packages.routes');
  const purchaseRoutes = require('./routes/purchases.routes');
  const reservationRoutes = require('./routes/reservations.routes');const paymentRoutes = require('./routes/payment.routes');

  // Mount API routes
  app.use('/api/users', userRoutes);
  app.use('/api/class-sessions', classSessionRoutes);
  app.use('/api/class-types', classTypeRoutes);
  app.use('/api/instructors', instructorRoutes);
  app.use('/api/packages', packageRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/payments', require('./routes/payment.routes'));
  app.use('/api/admin', require('./routes/admin.routes'));


  app.use((err, req, res, next) => { // Basic error handling
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  
  // START SERVER ON PORT 5000
  const PORT = process.env.PORT || 5000;

  // PRODUCTION AND DEV SERVER SETUP
  if (process.env.NODE_ENV === 'production') {
    // Railway handles HTTPS automatically - just use HTTP server
    app.listen(PORT, () => {
      console.log(`Production server running on port ${PORT}`);
    });
  } else {
    // Development with HTTPS certs (only if certs exist)
    const certPath = './certs/localhost-key.pem';
    const certExists = fs.existsSync(certPath);
    
    if (certExists) {
      const httpsOptions = {
        key: fs.readFileSync('./certs/localhost-key.pem'),
        cert: fs.readFileSync('./certs/localhost.pem')
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
  } 

  // debug endpoint test
  app.get('/api/ping', (req, res) => {
    res.json({ message: 'Backend activated' });
    console.log('Ping received from frontend!');
  });

  // Frontend config endpoint - provides API URL from environment
  app.get('/api/config', (req, res) => {
    const config = require('./config/environment.js');
    res.json({
      apiUrl: config.getApiUrl(),
      baseUrl: config.api.baseUrl,
      environment: process.env.NODE_ENV || 'development'
    });
  });