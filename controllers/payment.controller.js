const { MercadoPagoConfig, Preference } = require('mercadopago');
require('dotenv').config();

// Log to check if access token is loaded
console.log('MP_ACCESS_TOKEN loaded:', process.env.MP_ACCESS_TOKEN ? 'Yes' : 'No');

// Configure MercadoPago with your access token
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || 'APP_USR-4434682279033323-072219-fecfdf1c4fb06a1c8a8dc1a2c582de6e-1899614331',
  options: {
    timeout: 30000, // 30 seconds timeout
    retries: 3 // Retry 3 times on failure
  }
});

const preference = new Preference(client);

// Create payment preference
exports.createPreference = async (req, res) => {
  try {
    const { title, price, quantity, external_reference } = req.body;

    console.log('Request body:', req.body);
    console.log('Creating preference with:', { title, price, quantity, external_reference });

    // Validate required fields
    if (!title || !price) {
      return res.status(400).json({ 
        error: 'Title and price are required',
        received: { title, price }
      });
    }

    const preferenceData = {
      items: [
        {
          id: Date.now().toString(),
          title: String(title),
          unit_price: Number(parseFloat(price)),
          quantity: Number(parseInt(quantity) || 1),
          currency_id: 'MXN',
          description: 'Paquete de clases de Pilates'
        }
      ],
      back_urls: {
        success: 'http://localhost:5000/api/payments/success',
        failure: 'http://localhost:5000/api/payments/failure',
        pending: 'http://localhost:5000/api/payments/pending'
      },
      // Remove auto_return for now to avoid the error
      // auto_return: 'approved',
      external_reference: external_reference || '',
      statement_descriptor: 'PILATES STUDIO',
      payment_methods: {
        excluded_payment_types: [],
        installments: 1
      },
      binary_mode: true // Instant approval or rejection
    };

    console.log('Preference data to send:', JSON.stringify(preferenceData, null, 2));
    console.log('Creating preference with MercadoPago...');

    const response = await preference.create({ body: preferenceData });
    
    console.log('Preference created successfully:', response.id);
    console.log('Response object:', JSON.stringify(response, null, 2));
    
    // Use sandbox URL for testing
    const checkoutUrl = response.sandbox_init_point || response.init_point;
    
    res.status(200).json({ 
      init_point: checkoutUrl,
      preference_id: response.id
    });
  } catch (error) {
    console.error('Error al crear preferencia:', error);
    console.error('Error details:', error.response?.data || error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
    res.status(500).json({ 
      error: 'No se pudo crear la preferencia',
      details: error.message,
      fullError: error.response?.data || error
    });
  }
};

// Handle successful payment
exports.handleSuccess = async (req, res) => {
  try {
    const { collection_id, collection_status, payment_id, status, external_reference, merchant_order_id } = req.query;

    console.log('Payment success callback:', req.query);

    // Parse the metadata from external_reference
    if (external_reference && collection_status === 'approved') {
      const metadata = JSON.parse(decodeURIComponent(external_reference));
      
      // Create the purchase in the database
      const Purchase = require('../schemas/purchases.model');
      const Package = require('../schemas/packages.model');
      
      // Get package details - note that the packageId is a string ID, not ObjectId
      const package = await Package.findById(metadata.packageId);
      if (!package) {
        console.error('Package not found:', metadata.packageId);
        return res.redirect('/interfaces/error.html');
      }

      // Check if user already has an active package
      const existingActive = await Purchase.findOne({
        userId: metadata.userId,
        expiresAt: { $gt: new Date() },
        creditsLeft: { $gt: 0 }
      });

      if (existingActive) {
        console.log('User already has active package');
        return res.redirect('/interfaces/error.html');
      }

      // Calculate expiration date
      const boughtAt = new Date();
      const expiresAt = new Date(boughtAt);
      expiresAt.setDate(expiresAt.getDate() + package.validDays);

      // Create purchase record
      const purchase = await Purchase.create({
        userId: metadata.userId,
        packageId: metadata.packageId,
        boughtAt,
        expiresAt,
        creditsLeft: package.creditCount,
        mercadoPagoPaymentId: payment_id // Store payment ID for reference
      });

      console.log('Purchase created successfully:', purchase._id);
    }

    // Redirect to success page
    res.redirect('/interfaces/success.html');
  } catch (error) {
    console.error('Error handling success:', error);
    res.redirect('/interfaces/error.html');
  }
};

// Handle failed payment
exports.handleFailure = async (req, res) => {
  console.log('Payment failed:', req.query);
  res.redirect('/interfaces/failure.html');
};

// Handle pending payment
exports.handlePending = async (req, res) => {
  console.log('Payment pending:', req.query);
  res.redirect('/interfaces/pending.html');
};

// Webhook for payment notifications (IPN)
exports.webhook = async (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (type === 'payment') {
      // Get payment details from MercadoPago
      console.log('Payment notification received:', data.id);
      // You can fetch payment details here if needed
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
};