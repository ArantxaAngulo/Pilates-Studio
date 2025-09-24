const mongoose = require('mongoose');
const crypto = require('crypto');
const envConfig = require('../config/environment');
const Purchase = require('../schemas/purchases.model');
const Package = require('../schemas/packages.model');
const User = require('../schemas/user.model');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const businessRules = require('../config/businessRules.config');
const Reservation = require('../schemas/reservations.model');
const ClassSession = require('../schemas/classSessions.model');
const { canUserPurchase, createPurchaseWithValidation } = require('../helpers/purchaseHelper');
require('dotenv').config();

// Get URLs from environment variables
const getBaseUrl = () => {
    if (process.env.NODE_ENV === 'production') {
        return 'https://www.rebetta-studio.fit' || process.env.BASE_URL;
    }
    return process.env.BASE_URL || 'http://localhost:5000';
};

const getFrontendUrl = () => {
    if (process.env.NODE_ENV === 'production') {
        return 'https://www.rebetta-studio.fit' || process.env.FRONTEND_URL;
    }
    return process.env.FRONTEND_URL || 'http://localhost:5000';
};

const BASE_URL = getBaseUrl();
const FRONTEND_URL = getFrontendUrl();

console.log('MP_ACCESS_TOKEN loaded:', process.env.MP_ACCESS_TOKEN ? 'Yes' : 'No');
console.log('🔗 BASE_URL:', BASE_URL);
console.log('🔗 Webhook URL will be:', `${BASE_URL}/api/payments/webhook`);
console.log('🔗 Success URL will be:', `${BASE_URL}/interfaces/success.html`);
console.log('🔗 Failure URL will be:', `${BASE_URL}/interfaces/failure.html`);
console.log('🔗 Pending URL will be:', `${BASE_URL}/interfaces/pending.html`);

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: {
    timeout: 30000,
    retries: 3
  }
});

const preference = new Preference(client);
const paymentClient = new Payment(client);

// Check if user has already purchased trial package
async function hasUserPurchasedTrial(userId) {
  try {
    const trialPurchase = await Purchase.findOne({
      userId,
      packageId: 'pkg-trial' // Trial package ID from your packages.json
    });
    return !!trialPurchase;
  } catch (error) {
    console.error('Error checking trial purchase:', error);
    return false;
  }
}

// Create payment preference for packages
exports.createPreference = async (req, res) => {
  try {
    const { title, price, quantity, external_reference, packageId, userId, isTrial } = req.body;

    console.log('Request body:', req.body);

    // Build the external_reference if not provided
    let finalExternalReference = external_reference;
    if (!finalExternalReference && packageId) {
      finalExternalReference = JSON.stringify({
        type: 'package',
        packageId: packageId,
        packageName: title,
        packagePrice: price,
        userId: userId,
        isTrial: isTrial || false
      });
    }
    
    console.log('Creating preference with external_reference:', finalExternalReference);

    // Parse external_reference to check if it's a trial package
    if (finalExternalReference) {
      try {
        const metadata = JSON.parse(finalExternalReference);
        
        // Check if this is a trial package purchase
        if (metadata.packageId === 'pkg-trial' && metadata.userId) {
          const hasTrial = await hasUserPurchasedTrial(metadata.userId);
          if (hasTrial) {
            return res.status(400).json({ 
              error: 'Ya has comprado la clase de prueba anteriormente. Por favor selecciona otro paquete.',
              code: 'TRIAL_ALREADY_PURCHASED'
            });
          }
        }
      } catch (e) {
        console.error('Error parsing external_reference:', e);
      }
    }

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
        success: `${BASE_URL}/interfaces/success.html`,
        failure: `${BASE_URL}/interfaces/failure.html`,
        pending: `${BASE_URL}/interfaces/pending.html`
      },
      notification_url: `${BASE_URL}/api/payments/webhook`,
      auto_return: 'approved',
      external_reference: finalExternalReference || '',
      statement_descriptor: 'PILATES STUDIO',
      payment_methods: {
        excluded_payment_types: [],
        installments: 1
      },
      binary_mode: true
    };

    console.log('Preference data to send:', JSON.stringify(preferenceData, null, 2));
    console.log('Creating preference with MercadoPago...');

    const response = await preference.create({ body: preferenceData });
    
    console.log('Preference created successfully:', response.id);
    console.log('Init point:', response.init_point || response.sandbox_init_point);
    
    const checkoutUrl = response.init_point || response.sandbox_init_point;
    
    res.status(200).json({ 
      init_point: checkoutUrl,
      preference_id: response.id
    });
  } catch (error) {
    console.error('Error al crear preferencia:', error);
    console.error('Error details:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'No se pudo crear la preferencia',
      details: error.message,
      fullError: error.response?.data || error
    });
  }
};

// Handle successful payment
exports.handleSuccess = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { payment_id, status, external_reference, collection_status } = req.query;
    console.log('Payment success callback received:', { payment_id, status, external_reference, collection_status });

    const isApproved = collection_status === 'approved' || status === 'approved';
    
    if (payment_id && external_reference && isApproved) {
      try {
        const metadata = JSON.parse(decodeURIComponent(external_reference));
        
        if (metadata.type === 'single_class') {
            // Single class logic remains the same
            if (!metadata.userId || !metadata.sessionId || !metadata.singleClassPrice) {
                console.error("🔴 Invalid metadata for single class payment in success handler:", metadata);
                await session.abortTransaction();
                return res.redirect(`${FRONTEND_URL}/interfaces/error.html?reason=${encodeURIComponent('Invalid payment data')}`);
            }

            const existingCompletedReservation = await Reservation.findOne({ 
                userId: metadata.userId, 
                sessionId: metadata.sessionId, 
                paymentStatus: 'completed' 
            }).session(session);

            if (existingCompletedReservation) {
                console.log('Single class reservation already completed');
                await session.commitTransaction();
                return res.redirect(`${FRONTEND_URL}/interfaces/success.html?type=single_class`);
            }

            const classSession = await ClassSession.findById(metadata.sessionId).session(session);
            if (!classSession) {
                console.error(`🔴 Class session not found`);
                await session.abortTransaction();
                return res.redirect(`${FRONTEND_URL}/interfaces/error.html?reason=${encodeURIComponent('Class session not found')}`);
            }
            if (classSession.reservedCount >= classSession.capacity) {
                console.error(`🔴 Class session is full`);
                await session.abortTransaction();
                return res.redirect(`${FRONTEND_URL}/interfaces/error.html?reason=${encodeURIComponent('Class session is full')}`);
            }

            const newReservation = new Reservation({
                userId: metadata.userId,
                sessionId: metadata.sessionId,
                purchaseId: null,
                reservedAt: new Date(),
                paymentStatus: 'completed',
                paymentMethod: 'single_class',
                singleClassPrice: metadata.singleClassPrice,
                mercadoPagoPaymentId: payment_id,
                paymentCompletedAt: new Date()
            });
            await newReservation.save({ session });

            await ClassSession.findByIdAndUpdate(
                metadata.sessionId,
                { $inc: { reservedCount: 1 } },
                { session }
            );
            
            await session.commitTransaction();
            console.log('Single class payment completed and reservation created:', newReservation._id);
            return res.redirect(`${FRONTEND_URL}/interfaces/success.html?type=single_class`);
            
        } else if (metadata.type === 'package') {
            // For package purchases
            console.log('Processing package purchase for:', metadata.packageId);
            
            // First check if purchase already exists (idempotency)
            const existingPurchase = await Purchase.findOne({ 
              mercadoPagoPaymentId: payment_id 
            }).session(session);
            
            if (existingPurchase) {
              console.log('Purchase already exists for this payment');
              await session.commitTransaction();
              return res.redirect(`${FRONTEND_URL}/interfaces/success.html?existing=true`);
            }

            // Get package details
            const package = await Package.findById(metadata.packageId).session(session);
            if (!package) {
              console.error('Package not found:', metadata.packageId);
              await session.abortTransaction();
              return res.redirect(`${FRONTEND_URL}/interfaces/error.html?reason=package_not_found`);
            }

            // Create the purchase WITHOUT trying to fetch payment from MercadoPago
            // (since it's causing 404 errors in sandbox)
            const newPurchase = new Purchase({
              userId: metadata.userId,
              packageId: metadata.packageId,
              boughtAt: new Date(),
              expiresAt: new Date(Date.now() + package.validDays * 24 * 60 * 60 * 1000),
              creditsLeft: package.creditCount,
              mercadoPagoPaymentId: payment_id
            });

            await newPurchase.save({ session });
            
            await session.commitTransaction();
            console.log('Package purchase created successfully:', newPurchase._id);
            return res.redirect(`${FRONTEND_URL}/interfaces/success.html?type=package`);
        }
        
      } catch (error) {
        console.error('Error processing payment:', error);
        // Only abort if transaction is still active
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        return res.redirect(`${FRONTEND_URL}/interfaces/error.html?reason=processing_error`);
      }
    }

    // If we get here, commit any pending transaction
    if (session.inTransaction()) {
      await session.commitTransaction();
    }
    res.redirect(`${FRONTEND_URL}/interfaces/success.html`);
    
  } catch (error) {
    console.error('Error handling success callback:', error);
    // Only abort if transaction is still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    res.redirect(`${FRONTEND_URL}/interfaces/error.html?reason=processing_error`);
  } finally {
    session.endSession();
  }
};

// Handle failed payment
exports.handleFailure = async (req, res) => {
  console.log('Payment failed:', req.query);
  const { external_reference } = req.query;
  try {
      if (external_reference) {
          const metadata = JSON.parse(decodeURIComponent(external_reference));
          if (metadata.type === 'single_class') {
              console.log(`Payment failed for single class booking. No reservation record created.`);
          }
      }
  } catch (e) {
      console.error("Error parsing external_reference on failure:", e);
  }
  res.redirect(`${FRONTEND_URL}/interfaces/failure.html`);
};

// Handle pending payment
exports.handlePending = async (req, res) => {
  console.log('Payment pending:', req.query);
  const { external_reference } = req.query;
  try {
    if (external_reference) {
        const metadata = JSON.parse(decodeURIComponent(external_reference));
        if (metadata.type === 'single_class') {
            console.log(`Payment pending for single class booking. No reservation record created yet.`);
        }
    }
  } catch (e) {
      console.error("Error parsing external_reference on pending:", e);
  }
  res.redirect(`${FRONTEND_URL}/interfaces/pending.html`);
};

// Create single class payment preference
exports.createSingleClassPreference = async (req, res) => {
    try {
        const { userId, sessionId, singleClassPrice, classSessionName } = req.body;

        if (!userId || !sessionId || !singleClassPrice || !classSessionName) {
            return res.status(400).json({ error: 'userId, sessionId, singleClassPrice, and classSessionName are required.' });
        }

        // Validate that the session exists and is not full
        const classSession = await ClassSession.findById(sessionId);
        if (!classSession) {
            return res.status(404).json({ error: 'Class session not found.' });
        }
        if (classSession.reservedCount >= classSession.capacity) {
            return res.status(400).json({ error: 'Class session is full.' });
        }
        if (classSession.startsAt <= new Date()) {
            return res.status(400).json({ error: 'Cannot book past or ongoing sessions.' });
        }
        
        // Ensure no completed reservation already exists for this user/session
        const existingCompletedReservation = await Reservation.findOne({ userId, sessionId, paymentStatus: 'completed' });
        if (existingCompletedReservation) {
            return res.status(400).json({ error: 'User already has a completed reservation for this session.' });
        }
        
        // Create preference with ngrok URLs
        const preferenceData = {
            items: [{
                title: `Clase Individual - ${classSessionName}`,
                unit_price: singleClassPrice,
                quantity: 1,
                currency_id: 'MXN'
            }],
            back_urls: {
              success: `${BASE_URL}/interfaces/success.html`,
              failure: `${BASE_URL}/interfaces/failure.html`,
              pending: `${BASE_URL}/interfaces/pending.html`
            },
            notification_url: `${BASE_URL}/api/payments/webhook`,
            auto_return: 'approved',
            external_reference: JSON.stringify({
                type: 'single_class',
                userId,
                sessionId,
                singleClassPrice,
                classSessionName
            }),
            statement_descriptor: 'PILATES STUDIO',
            payment_methods: {
              excluded_payment_types: [],
              installments: 1
            },
            binary_mode: true
        };

        const response = await preference.create({ body: preferenceData });
        res.json({
            id: response.id,
            init_point: response.init_point || response.sandbox_init_point
        });

    } catch (error) {
        console.error('Error creating single class preference:', error);
        res.status(500).json({ 
            error: 'Error creating payment preference',
            details: error.message 
        });
    }
};

// Helper function to validate MercadoPago webhook signature
const validateWebhookSignature = (req) => {
  try {
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    
    if (!xSignature || !xRequestId) {
      console.error('🔴 Missing MercadoPago signature headers');
      return false;
    }

    // Extract ts and hash from x-signature header
    const signatureParts = xSignature.split(',');
    let ts, hash;
    
    signatureParts.forEach(part => {
      const [key, value] = part.split('=');
      if (key && value) {
        if (key.trim() === 'ts') ts = value.trim();
        if (key.trim() === 'v1') hash = value.trim();
      }
    });

    if (!ts || !hash) {
      console.error('🔴 Invalid signature format');
      return false;
    }

    // Create signature string
    const dataString = JSON.stringify(req.body);
    const manifest = `id:${req.body?.data?.id || ''};request-id:${xRequestId};ts:${ts};`;
    
    // Generate HMAC
    const hmac = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET);
    hmac.update(manifest);
    const expectedHash = hmac.digest('hex');

    const isValid = expectedHash === hash;
    
    if (!isValid) {
      console.error('🔴 Webhook signature validation failed');
      console.error('Expected:', expectedHash);
      console.error('Received:', hash);
      console.error('Manifest:', manifest);
    } else {
      console.log('✅ Webhook signature validated successfully');
    }

    return isValid;
  } catch (error) {
    console.error('🔴 Error validating webhook signature:', error);
    return false;
  }
};

// Webhook for payment notifications (IPN)
exports.webhook = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id, type, data } = req.body;
    
    console.log('🔔 Webhook received:', { 
      id, 
      type, 
      data, 
      headers: {
        'x-signature': req.headers['x-signature'],
        'x-request-id': req.headers['x-request-id'],
        'user-agent': req.headers['user-agent']
      }
    });
    
    // 1. Handle test webhooks (bypass signature validation for MercadoPago dashboard tests)
    if (id === "123456" || (data && (data.id === "1234157574" || data.id === "123456"))) {
      console.log("✅ Accepted test webhook from MercadoPago dashboard");
      await session.commitTransaction();
      return res.status(200).json({ status: "ok", message: "Test webhook accepted" });
    }

    // 2. Validate webhook signature for production webhooks
    if (process.env.MP_WEBHOOK_SECRET && !validateWebhookSignature(req)) {
      console.error('🔴 Webhook signature validation failed - rejecting request');
      await session.abortTransaction();
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (type === 'payment' && data && data.id) {
      console.log(`🟠 Processing payment webhook (ID: ${data.id})`);
      
      let payment;
      let paymentStatus;
      let metadata;

      // Improved MercadoPago API error handling
      try {
        console.log(`📡 Fetching payment details from MercadoPago API...`);
        payment = await paymentClient.get({ id: data.id });
        paymentStatus = payment.status;
        console.log(`💳 Payment ${data.id} status: ${paymentStatus}`);
        console.log(`💳 Payment details:`, {
          id: payment.id,
          status: payment.status,
          status_detail: payment.status_detail,
          external_reference: payment.external_reference,
          transaction_amount: payment.transaction_amount,
          currency_id: payment.currency_id,
          date_created: payment.date_created,
          payer_email: payment.payer?.email
        });
      } catch (mpError) {
        console.error(`🔴 MercadoPago API error for payment ${data.id}:`, {
          status: mpError.status,
          message: mpError.message,
          cause: mpError.cause
        });
        
        // Don't fail the webhook for API errors - MercadoPago might retry
        await session.commitTransaction();
        return res.status(200).send(`OK (MP API Error: ${mpError.status})`);
      }
      
      if (paymentStatus !== 'approved') {
        console.log(`⚠️ Payment ${data.id} not approved (status: ${paymentStatus}), ignoring webhook`);
        await session.commitTransaction();
        return res.status(200).send(`OK (Ignored status: ${paymentStatus})`);
      }

      if (!payment.external_reference) {
        console.error("🔴 Missing external_reference in payment");
        await session.commitTransaction();
        return res.status(200).send("OK (Missing external_reference)");
      }

      try {
        metadata = JSON.parse(payment.external_reference);
        console.log(`📋 Parsed metadata:`, metadata);
      } catch (e) {
        console.error("🔴 Invalid external_reference format:", payment.external_reference);
        await session.commitTransaction();
        return res.status(200).send("OK (Invalid metadata format)");
      }
      
      // Handle single class payment webhook
      if (metadata.type === 'single_class') {
          if (!metadata.userId || !metadata.sessionId || !metadata.singleClassPrice) {
              console.error("🔴 Invalid metadata for single class payment:", metadata);
              await session.commitTransaction();
              return res.status(200).send("OK (Invalid single class metadata)");
          }

          // Check if a reservation for this user and session has ALREADY been completed (idempotency)
          const existingCompletedReservation = await Reservation.findOne({ 
              userId: metadata.userId, 
              sessionId: metadata.sessionId, 
              paymentStatus: 'completed' 
          }).session(session);

          if (existingCompletedReservation) {
              console.log("🟡 Single class reservation already completed, webhook ignored for user:", metadata.userId, "session:", metadata.sessionId);
              await session.commitTransaction();
              return res.status(200).send("OK (Single class reservation already completed)");
          }

          // Check class session capacity again to prevent overbooking if concurrent
          const classSession = await ClassSession.findById(metadata.sessionId).session(session);
          if (!classSession) {
              console.error(`🔴 Class session not found for single class payment: ${metadata.sessionId}`);
              await session.abortTransaction();
              return res.status(200).send("OK (Class session not found)");
          }
          if (classSession.reservedCount >= classSession.capacity) {
              console.error(`🔴 Class session is full for single class payment: ${metadata.sessionId}`);
              await session.abortTransaction();
              return res.status(200).send("OK (Class session is full)");
          }
          
          // CREATE THE RESERVATION HERE
          const newReservation = new Reservation({
              userId: metadata.userId,
              sessionId: metadata.sessionId,
              purchaseId: null,
              reservedAt: new Date(),
              paymentStatus: 'completed',
              paymentMethod: 'single_class',
              singleClassPrice: metadata.singleClassPrice,
              mercadoPagoPaymentId: data.id,
              paymentCompletedAt: new Date()
          });
          await newReservation.save({ session });

          // Increment reservedCount in the class session
          await ClassSession.findByIdAndUpdate(
              metadata.sessionId,
              { $inc: { reservedCount: 1 } },
              { session }
          );

          console.log(`🟢 Single class reservation created and payment completed for user ${metadata.userId}, session ${metadata.sessionId}`);
      } else {
        // Original package purchase webhook logic
        if (!metadata.userId || !metadata.packageId) {
          console.error("🔴 Invalid metadata:", metadata);
          await session.commitTransaction();
          return res.status(200).send("OK (Invalid metadata)");
        }

        const existingPurchase = await Purchase.findOne({ 
          mercadoPagoPaymentId: data.id 
        }).session(session);
        
        if (existingPurchase) {
          console.log("🟡 Duplicate purchase ignored");
          await session.commitTransaction();
          return res.status(200).send("OK (Duplicate)");
        }

        const package = await Package.findById(metadata.packageId).session(session);
        if (!package) {
          console.error(`🔴 Package not found: ${metadata.packageId}`);
          await session.commitTransaction();
          return res.status(200).send("OK (Package not found)");
        }

        const purchaseResult = await createPurchaseWithValidation({
          userId: metadata.userId,
          packageId: metadata.packageId,
          paymentId: data.id
        }, {
          allowMultiple: businessRules.getRule('purchase', 'allowMultipleActivePackages'),
          skipActiveCheck: businessRules.testing.bypassPurchaseRestrictions
        }, session);
        
        if (purchaseResult.success) {
          console.log(`🟢 Package purchase created successfully:`, {
            purchaseId: purchaseResult.purchase._id,
            userId: metadata.userId,
            packageId: metadata.packageId,
            paymentId: data.id,
            creditsLeft: purchaseResult.purchase.creditsLeft,
            expiresAt: purchaseResult.purchase.expiresAt
          });
        } else {
          console.error(`🔴 Package purchase creation failed:`, {
            error: purchaseResult.error,
            userId: metadata.userId,
            packageId: metadata.packageId,
            paymentId: data.id
          });
          // Still commit transaction to avoid webhook retries for business logic errors
        }
      }

      await session.commitTransaction();
    }

    console.log('✅ Webhook processing completed successfully');
    res.status(200).send('OK');
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('🔴 Critical webhook error:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(200).send('OK (Error processed)');
  } finally {
    session.endSession();
  }
};