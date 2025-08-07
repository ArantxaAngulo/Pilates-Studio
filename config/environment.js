// environment.js - BRANCH AKRANKA - CONFIG FOR LOCALHOST:5000
const isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = {
  // API URL configuration
  api: {
    baseUrl: 'http://localhost:5000',
    publicUrl: isDevelopment ? 'http://localhost:5000' : process.env.PUBLIC_URL,
  },
  
  // Frontend URLs  
  frontend: {
    baseUrl: 'http://localhost:5000',
    publicUrl: isDevelopment ? 'http://localhost:5000' : process.env.FRONTEND_PUBLIC_URL,
  },
  
  // MercadoPago URLs - localhost
  mercadoPago: {
    successUrl: 'http://localhost:5000/interfaces/success.html',
    failureUrl: 'http://localhost:5000/interfaces/failure.html', 
    pendingUrl: 'http://localhost:5000/interfaces/pending.html',
    webhookUrl: 'http://localhost:5000/api/payments/webhook',
  },
  
  // Database configuration
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  
  // Get the appropriate API URL for frontend
  getApiUrl() {
    return 'http://localhost:5000';
  }
};