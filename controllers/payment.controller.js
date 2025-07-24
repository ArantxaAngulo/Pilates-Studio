const mongoose = require('mongoose');
const envConfig = require('../config/environment');
const Purchase = require('../schemas/purchases.model');
const Package = require('../schemas/packages.model');
const User = require('../schemas/user.model');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const businessRules = require('../config/businessRules.config');
const { canUserPurchase, createPurchaseWithValidation } = require('../helpers/purchaseHelper');
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
const paymentClient = new Payment(client); // Initialize payment client

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
          success: envConfig.mercadoPago.successUrl,
          failure: envConfig.mercadoPago.failureUrl,
          pending: envConfig.mercadoPago.pendingUrl
      },
      notification_url: envConfig.mercadoPago.webhookUrl,
      auto_return: 'approved',
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
    const { payment_id, status, external_reference, collection_status } = req.query;
    console.log('Payment success callback received:', { payment_id, status, external_reference, collection_status });

    // ===== SANDBOX BLOCK =====
    if (businessRules.payment.environment === 'sandbox') {
      console.log("🟡 Sandbox mode - Bypassing payment verification");
      
      try {
        const metadata = JSON.parse(decodeURIComponent(external_reference));
        
        // In development, respect business rules but log everything
        const eligibility = await canUserPurchase(
            metadata.userId, 
            businessRules.getRule('purchase', 'allowMultipleActivePackages')
        );
        
        console.log("[DEV] Sandbox eligibility check:", eligibility);
        
        if (!eligibility.canPurchase) {
            console.log("[DEV] Blocking sandbox purchase due to business rules");
            return res.redirect(`/interfaces/error.html?reason=${encodeURIComponent(eligibility.reason)}`);
        }

        // Still respect business rules even in sandbox mode
        const purchaseResult = await createPurchaseWithValidation({
          userId: metadata.userId,
          packageId: metadata.packageId,
          paymentId: payment_id || `SANDBOX_${Date.now()}`
        }, {
          allowMultiple: businessRules.getRule('purchase', 'allowMultipleActivePackages'),
          skipActiveCheck: false // Don't skip checks even in sandbox
        });
        
        if (!purchaseResult.success) {
          console.error('Sandbox purchase failed:', purchaseResult.error);
          return res.redirect(`/interfaces/error.html?reason=${encodeURIComponent(purchaseResult.error)}`);
        }
      } catch (error) {
        console.error('Sandbox purchase error:', error);
      }
      return res.redirect('/interfaces/success.html');
    }
    // ===== SANDBOX BLOCK =====

    // Check multiple status indicators
    const isApproved = collection_status === 'approved' || status === 'approved';
    
    if (payment_id && external_reference && isApproved) {
      try {
        const metadata = JSON.parse(decodeURIComponent(external_reference));
        
        // Verify payment status with MercadoPago API
        const payment = await paymentClient.get({ id: payment_id });
        console.log('Payment verification result:', payment.status);

        if (payment.status === 'approved') {
          const package = await Package.findById(metadata.packageId);
          if (!package) {
            console.error('Package not found:', metadata.packageId);
            return res.redirect('/interfaces/error.html?reason=package_not_found');
          }

          // Check if purchase already exists for this payment
          const existingPurchase = await Purchase.findOne({ 
            mercadoPagoPaymentId: payment_id 
          });
          
          if (existingPurchase) {
            console.log('Purchase already exists for this payment');
            return res.redirect('/interfaces/success.html?existing=true');
          }

          // Use business rules to determine if we should allow multiple packages
          const allowMultiple = businessRules.getRule('purchase', 'allowMultipleActivePackages');
          
          // Create purchase using the helper function
          const purchaseResult = await createPurchaseWithValidation({
            userId: metadata.userId,
            packageId: metadata.packageId,
            paymentId: payment_id
          }, {
            allowMultiple: allowMultiple,
            skipActiveCheck: businessRules.testing.bypassPurchaseRestrictions
          });

          if (purchaseResult.success) {
            console.log('Purchase created successfully:', purchaseResult.purchase._id);
          } else {
            console.error('Purchase creation failed:', purchaseResult.error);
            // Don't fail the redirect - payment was still successful
          }
        }
      } catch (error) {
        console.error('Error processing payment:', error);
        // Don't fail the redirect if there's an error processing
        // User still paid successfully
      }
    }

    // Always redirect to success if we got here (payment was approved)
    res.redirect('/interfaces/success.html');
  } catch (error) {
    console.error('Error handling success:', error);
    res.redirect('/interfaces/error.html?reason=processing_error');
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
    const { id, type, data } = req.body;
    
    console.log('Webhook received:', { id, type, data });
    
    // 1. Handle test webhooks 
    if (id === "123456" || (data && data.id === "123456")) {
      console.log("✅ Accepted test webhook");
      return res.status(200).json({ status: "ok", message: "Test webhook accepted" });
    }

    if (type === 'payment' && data && data.id) {
      console.log(`🟠 Payment webhook received (ID: ${data.id})`);
      
      // ===== SANBOX BLOCK =====
      if (businessRules.payment.environment === 'sandbox') {
        console.log("🟡 Sandbox mode - Bypassing payment verification");
        const paymentStatus = 'approved';
        let metadata; 
        
        // Get metadata from query if payment object isn't available
        if (req.query.external_reference) {
          metadata = JSON.parse(decodeURIComponent(req.query.external_reference));
        } else {
          // Fallback: Create test metadata
          metadata = {
            userId: "TEST_USER_ID",
            packageId: "TEST_PKG_ID"
          };
        }
      } else {
        // Production: Verify with MercadoPago API
        const payment = await paymentClient.get({ id: data.id });
        paymentStatus = payment.status;
        metadata = JSON.parse(payment.external_reference);
      }
      // ===== END OF SANBOX BLOCK =====

      // 2. Verify payment with MercadoPago API
      const payment = await paymentClient.get({ id: data.id });
      const paymentStatus = payment.status;
      console.log(`Payment ${data.id} status: ${paymentStatus}`);
      
      // 3. Only process approved payments
      if (paymentStatus !== 'approved') {
        return res.status(200).send(`OK (Ignored status: ${paymentStatus})`);
      }

      // 4. Validate external_reference
      if (!payment.external_reference) {
        console.error("🔴 Missing external_reference");
        return res.status(200).send("OK (Missing external_reference)");
      }

      let metadata;
      try {
        metadata = JSON.parse(payment.external_reference);
      } catch (e) {
        console.error("🔴 Invalid external_reference format:", payment.external_reference);
        return res.status(200).send("OK (Invalid metadata format)");
      }
      
      // 5. Validate required fields
      if (!metadata.userId || !metadata.packageId) {
        console.error("🔴 Invalid metadata:", metadata);
        return res.status(200).send("OK (Invalid metadata)");
      }

      // 6. Check for duplicate purchases
      const existingPurchase = await Purchase.findOne({ 
        mercadoPagoPaymentId: data.id 
      });
      
      if (existingPurchase) {
        console.log("🟡 Duplicate purchase ignored");
        return res.status(200).send("OK (Duplicate)");
      }

      // 7. Verify package exists
      const package = await Package.findById(metadata.packageId);
      if (!package) {
        console.error(`🔴 Package not found: ${metadata.packageId}`);
        return res.status(200).send("OK (Package not found)");
      }

      // 8. Create purchase using helper function
      const purchaseResult = await createPurchaseWithValidation({
        userId: metadata.userId,
        packageId: metadata.packageId,
        paymentId: data.id
      }, {
        allowMultiple: businessRules.getRule('purchase', 'allowMultipleActivePackages'),
        skipActiveCheck: businessRules.testing.bypassPurchaseRestrictions
      });

      if (purchaseResult.success) {
        console.log(`🟢 Purchase created: ${purchaseResult.purchase._id}`);
      } else {
        console.error(`🔴 Purchase creation failed: ${purchaseResult.error}`);
      }
    }

    // Always return 200 for webhooks
    res.status(200).send('OK');
  } catch (error) {
    console.error('🔴 Webhook error:', error);
    // Still return 200 to prevent retries
    res.status(200).send('OK (Error processed)');
  }
};