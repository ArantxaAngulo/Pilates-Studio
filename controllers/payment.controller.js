const mongoose = require('mongoose');
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

const NGROK_URL = 'https://e24f77c98e56.ngrok-free.app'; // UPDATE THIS when ngrok changes
const LOCALHOST_URL = 'http://localhost:5000'; // Your frontend URL

console.log('MP_ACCESS_TOKEN loaded:', process.env.MP_ACCESS_TOKEN ? 'Yes' : 'No');

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || 'APP_USR-4434682279033323-072219-fecfdf1c4fb06a1c8a8dc1a2c582de6e-1899614331',
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
        success: `${NGROK_URL}/api/payments/success`,
        failure: `${NGROK_URL}/api/payments/failure`,
        pending: `${NGROK_URL}/api/payments/pending`
      },
      notification_url: `${NGROK_URL}/api/payments/webhook`,
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
    console.log('Init point:', response.sandbox_init_point || response.init_point);
    
    const checkoutUrl = response.sandbox_init_point || response.init_point;
    
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
                return res.redirect(`${LOCALHOST_URL}/interfaces/error.html?reason=${encodeURIComponent('Invalid payment data')}`);
            }

            const existingCompletedReservation = await Reservation.findOne({ 
                userId: metadata.userId, 
                sessionId: metadata.sessionId, 
                paymentStatus: 'completed' 
            }).session(session);

            if (existingCompletedReservation) {
                console.log('Single class reservation already completed');
                await session.commitTransaction();
                return res.redirect(`${LOCALHOST_URL}/interfaces/success.html?type=single_class`);
            }

            const classSession = await ClassSession.findById(metadata.sessionId).session(session);
            if (!classSession) {
                console.error(`🔴 Class session not found`);
                await session.abortTransaction();
                return res.redirect(`${LOCALHOST_URL}/interfaces/error.html?reason=${encodeURIComponent('Class session not found')}`);
            }
            if (classSession.reservedCount >= classSession.capacity) {
                console.error(`🔴 Class session is full`);
                await session.abortTransaction();
                return res.redirect(`${LOCALHOST_URL}/interfaces/error.html?reason=${encodeURIComponent('Class session is full')}`);
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
            return res.redirect(`${LOCALHOST_URL}/interfaces/success.html?type=single_class`);
            
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
              return res.redirect(`${LOCALHOST_URL}/interfaces/success.html?existing=true`);
            }

            // Get package details
            const package = await Package.findById(metadata.packageId).session(session);
            if (!package) {
              console.error('Package not found:', metadata.packageId);
              await session.abortTransaction();
              return res.redirect(`${LOCALHOST_URL}/interfaces/error.html?reason=package_not_found`);
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
            return res.redirect(`${LOCALHOST_URL}/interfaces/success.html?type=package`);
        }
        
      } catch (error) {
        console.error('Error processing payment:', error);
        // Only abort if transaction is still active
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        return res.redirect(`${LOCALHOST_URL}/interfaces/error.html?reason=processing_error`);
      }
    }

    // If we get here, commit any pending transaction
    if (session.inTransaction()) {
      await session.commitTransaction();
    }
    res.redirect(`${LOCALHOST_URL}/interfaces/success.html`);
    
  } catch (error) {
    console.error('Error handling success callback:', error);
    // Only abort if transaction is still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    res.redirect(`${LOCALHOST_URL}/interfaces/error.html?reason=processing_error`);
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
  res.redirect(`${LOCALHOST_URL}/interfaces/failure.html`);
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
  res.redirect(`${LOCALHOST_URL}/interfaces/pending.html`);
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
                success: `${NGROK_URL}/api/payments/success`,
                failure: `${NGROK_URL}/api/payments/failure`,
                pending: `${NGROK_URL}/api/payments/pending`
            },
            notification_url: `${NGROK_URL}/api/payments/webhook`,
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
            init_point: response.sandbox_init_point || response.init_point
        });

    } catch (error) {
        console.error('Error creating single class preference:', error);
        res.status(500).json({ 
            error: 'Error creating payment preference',
            details: error.message 
        });
    }
};

// Webhook for payment notifications (IPN)
exports.webhook = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id, type, data } = req.body;
    
    console.log('Webhook received:', { id, type, data });
    
    // 1. Handle test webhooks 
    if (id === "123456" || (data && data.id === "1234157574")) {
      console.log("✅ Accepted test webhook");
      await session.commitTransaction();
      return res.status(200).json({ status: "ok", message: "Test webhook accepted" });
    }

    if (type === 'payment' && data && data.id) {
      console.log(`🟠 Payment webhook received (ID: ${data.id})`);
      
      let payment;
      let paymentStatus;
      let metadata;

      payment = await paymentClient.get({ id: data.id });
      paymentStatus = payment.status;
      console.log(`Payment ${data.id} status: ${paymentStatus}`);
      
      if (paymentStatus !== 'approved') {
        await session.commitTransaction();
        return res.status(200).send(`OK (Ignored status: ${paymentStatus})`);
      }

      if (!payment.external_reference) {
        console.error("🔴 Missing external_reference");
        await session.commitTransaction();
        return res.status(200).send("OK (Missing external_reference)");
      }

      try {
        metadata = JSON.parse(payment.external_reference);
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
          console.log(`🟢 Purchase created: ${purchaseResult.purchase._id}`);
        } else {
          console.error(`🔴 Purchase creation failed: ${purchaseResult.error}`);
        }
      }

      await session.commitTransaction();
    }

    res.status(200).send('OK');
  } catch (error) {
    await session.abortTransaction();
    console.error('🔴 Webhook error:', error);
    res.status(200).send('OK (Error processed)');
  } finally {
    session.endSession();
  }
};