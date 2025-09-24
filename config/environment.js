// environment.js - Railway-ready configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const isRailway = process.env.RAILWAY_ENVIRONMENT_NAME;

// Get base URL based on environment
const getBaseUrl = () => {
  if (isRailway || process.env.NODE_ENV === 'production') {
    return process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.BASE_URL || process.env.PUBLIC_URL;
  }
  return process.env.NGROK_URL || process.env.BASE_URL || 'http://localhost:5000';
};

const getFrontendUrl = () => {
  if (isRailway || process.env.NODE_ENV === 'production') {
    return process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.FRONTEND_URL || process.env.PRODUCTION_FRONTEND_URL;
  }
  return process.env.FRONTEND_URL || 'http://localhost:5000';
};

const baseUrl = getBaseUrl();
const frontendUrl = getFrontendUrl();

module.exports = {
  // API URL configuration
  api: {
    baseUrl: baseUrl,
    publicUrl: baseUrl,
  },
  
  // Frontend URLs  
  frontend: {
    baseUrl: frontendUrl,
    publicUrl: frontendUrl,
  },
  
  // MercadoPago URLs - environment aware
  mercadoPago: {
        successUrl: `${baseUrl}interfaces/success.html`,
        failureUrl: `${baseUrl}interfaces/failure.html`,
        pendingUrl: `${baseUrl}interfaces/pending.html`,
        webhookUrl: `${baseUrl}/api/payments/webhook`
  },
  
  // Database configuration
  database: {
    uri: process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/pilates-studio',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  
  // Environment info
  environment: {
    isDevelopment,
    isProduction: process.env.NODE_ENV === 'production',
    isRailway: !!isRailway,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 5000
  },
  
  // Get the appropriate API URL for frontend
  getApiUrl() {
    return baseUrl;
  },
  
  // Get frontend URL
  getFrontendUrl() {
    return frontendUrl;
  }
};