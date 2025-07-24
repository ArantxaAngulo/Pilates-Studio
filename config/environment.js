// Centralized environment configuration

const isDevelopment = process.env.NODE_ENV !== 'production';
//const ngrokUrl = process.env.NGROK_URL || 'https://e6564ebe907f.ngrok-free.app';
const localUrl = 'http://localhost:5000';
const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://pilates-studio-test.onrender.com'; // fallback

module.exports = {
  // API URL configuration
  api: {
    baseUrl: isDevelopment ? localUrl : process.env.API_URL,
    publicUrl: isDevelopment ? ngrokUrl : process.env.PUBLIC_URL,
  },
  
  // Frontend URLs
  frontend: {
    baseUrl: isDevelopment ? 'http://localhost:3000' : process.env.FRONTEND_URL,
    publicUrl: isDevelopment ? 'http://localhost:3000' : process.env.FRONTEND_PUBLIC_URL,
  },
  
  // MercadoPago URLs
  mercadoPago: {
    successUrl: `${isDevelopment ? localUrl : renderUrl}/api/payments/success`,
    failureUrl: `${isDevelopment ? localUrl : renderUrl}/api/payments/failure`,
    pendingUrl: `${isDevelopment ? localUrl : renderUrl}/api/payments/pending`,
    webhookUrl: `${isDevelopment ? localUrl : renderUrl}/api/payments/webhook`,
  },

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
    return isDevelopment ? localUrl : renderUrl;
  }
};