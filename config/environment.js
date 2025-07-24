// Centralized environment configuration

const isDevelopment = process.env.NODE_ENV !== 'production';
const ngrokUrl = process.env.NGROK_URL || 'https://e6564ebe907f.ngrok-free.app';
const localUrl = 'http://localhost:5000';

module.exports = {
  // API URL configuration
  api: {
    baseUrl: isDevelopment ? localUrl : process.env.API_URL,
    publicUrl: isDevelopment ? ngrokUrl : process.env.PUBLIC_URL,
  },
  
  // Frontend URLs
  frontend: {
    baseUrl: isDevelopment ? 'http://localhost:3000' : process.env.FRONTEND_URL,
    publicUrl: isDevelopment ? ngrokUrl : process.env.FRONTEND_PUBLIC_URL,
  },
  
  // MercadoPago URLs
  mercadoPago: {
    successUrl: `${ngrokUrl}/api/payments/success`,
    failureUrl: `${ngrokUrl}/api/payments/failure`,
    pendingUrl: `${ngrokUrl}/api/payments/pending`,
    webhookUrl: `${ngrokUrl}/api/payments/webhook`,
  },
  
  // Database configuration (never expose to frontend!)
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  
  // Get the appropriate API URL for frontend
  getApiUrl() {
    // If we're being accessed via ngrok, use ngrok URL
    // Otherwise use localhost
    return isDevelopment ? ngrokUrl : this.api.publicUrl;
  }
};