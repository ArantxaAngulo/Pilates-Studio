// STARTING FILE FOR SERVER. TO RUN, TYPE 'node server.js' 
require('dotenv').config(); // Load environment variables first
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
//const { authorizeRole } = require('./middleware/roles.middleware');
//const { verifyToken } = require('./middleware/auth.middleware');

app.use(cors({ // Enables CORS for security purposes
  origin: 'http://localhost:3000', // or your frontend origin
  credentials: true
}));
app.use(express.json()); // to parse JSON from frontend

// Connnect to Database
const connectDB = require('./config/db');
connectDB();

  app.use(express.static(path.join(__dirname, 'interfaces', 'landing-page.html')));
  
  // ROUTES
  const userRoutes = require('./routes/user.routes');
  app.use('/api/users', userRoutes);

  app.use((err, req, res, next) => { // Basic error handling
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  
  // START SERVER ON PORT 5000
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

// debug test
  app.get('/api/ping', (req, res) => {
    res.json({ message: 'Backend activated' });
    console.log('Ping received from frontend!');
  });