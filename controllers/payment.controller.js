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

// Create payment preference for packages
exports.createPreference = async (req, res) => {
  try {
    const { title, price, quantity, external_reference } = req.body;

    console.log('Request body:', req.body);
    console.log('Creating preference with:', { title, price, quantity, external_reference });

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
      binary_mode: true
    };

    console.log('Preference data to send:', JSON.stringify(preferenceData, null, 2));
    console.log('Creating preference with MercadoPago...');

    const response = await preference.create({ body: preferenceData });
    
    console.log('Preference created successfully:', response.id);
    console.log('Response object:', JSON.stringify(response, null, 2));
    
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
            if (!metadata.userId || !metadata.sessionId || !metadata.singleClassPrice) {
                console.error("🔴 Invalid metadata for single class payment in success handler:", metadata);
                await session.abortTransaction();
                return res.redirect(`/interfaces/error.html?reason=${encodeURIComponent('Invalid payment data')}`);
            }

            // Check for idempotency: has this reservation already been completed for this user/session?
            const existingCompletedReservation = await Reservation.findOne({ 
                userId: metadata.userId, 
                sessionId: metadata.sessionId, 
                paymentStatus: 'completed' 
            }).session(session);

            if (existingCompletedReservation) {
                console.log('Single class reservation already completed via webhook or previous success callback:', existingCompletedReservation._id);
                await session.commitTransaction();
                return res.redirect('/interfaces/success.html?type=single_class');
            }

            // Check class session capacity again
            const classSession = await ClassSession.findById(metadata.sessionId).session(session);
            if (!classSession) {
                console.error(`🔴 Class session not found for single class payment in success handler: ${metadata.sessionId}`);
                await session.abortTransaction();
                return res.redirect(`/interfaces/error.html?reason=${encodeURIComponent('Class session not found')}`);
            }
            if (classSession.reservedCount >= classSession.capacity) {
                console.error(`🔴 Class session is full for single class payment in success handler: ${metadata.sessionId}`);
                await session.abortTransaction();
                return res.redirect(`/interfaces/error.html?reason=${encodeURIComponent('Class session is full')}`);
            }

            // CREATE THE RESERVATION HERE (if not already created by webhook)
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

            // Increment reservedCount for the class session
            await ClassSession.findByIdAndUpdate(
                metadata.sessionId,
                { $inc: { reservedCount: 1 } },
                { session }
            );
            
            await session.commitTransaction();
            console.log('Single class payment completed and reservation created:', newReservation._id);
            return res.redirect('/interfaces/success.html?type=single_class');
        }

        // For package purchases
        const payment = await paymentClient.get({ id: payment_id });
        if (payment.status === 'approved') {
          const package = await Package.findById(metadata.packageId);
          if (!package) {
            console.error('Package not found:', metadata.packageId);
            await session.abortTransaction();
            return res.redirect('/interfaces/error.html?reason=package_not_found');
          }

          const existingPurchase = await Purchase.findOne({ 
            mercadoPagoPaymentId: payment_id 
          }).session(session);
          
          if (existingPurchase) {
            console.log('Purchase already exists for this payment');
            await session.commitTransaction();
            return res.redirect('/interfaces/success.html?existing=true');
          }

          const purchaseResult = await createPurchaseWithValidation({
            userId: metadata.userId,
            packageId: metadata.packageId,
            paymentId: payment_id
          }, {
            allowMultiple: businessRules.getRule('purchase', 'allowMultipleActivePackages'),
            skipActiveCheck: businessRules.testing.bypassPurchaseRestrictions
          }, session);
          
          if (purchaseResult.success) {
            console.log('Purchase created successfully:', purchaseResult.purchase._id);
          } else {
            console.error('Purchase creation failed:', purchaseResult.error);
          }
        }
      } catch (error) {
        await session.abortTransaction();
        console.error('Error processing payment:', error);
      }
    }

    await session.commitTransaction();
    res.redirect('/interfaces/success.html');
  } catch (error) {
    await session.abortTransaction();
    console.error('Error handling success callback:', error);
    res.redirect('/interfaces/error.html?reason=processing_error');
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
              // No reservation exists in DB yet, so nothing to update/delete.
              console.log(`Payment failed for single class booking. No reservation record created.`);
          }
      }
  } catch (e) {
      console.error("Error parsing external_reference on failure:", e);
  }
  res.redirect('/interfaces/failure.html');
};

// Handle pending payment
exports.handlePending = async (req, res) => {
  console.log('Payment pending:', req.query);
  const { external_reference } = req.query;
  try {
    if (external_reference) {
        const metadata = JSON.parse(decodeURIComponent(external_reference));
        if (metadata.type === 'single_class') {
            // No reservation exists in DB yet for pending single class payment.
            console.log(`Payment pending for single class booking. No reservation record created yet.`);
        }
    }
} catch (e) {
    console.error("Error parsing external_reference on pending:", e);
}
  res.redirect('/interfaces/pending.html');
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
        
        // Create preference
        const preferenceData = {
            items: [{
                title: `Clase Individual - ${classSessionName}`,
                unit_price: singleClassPrice,
                quantity: 1,
                currency_id: 'MXN'
            }],
            back_urls: {
                success: `${process.env.FRONTEND_URL}/interfaces/success.html?type=single_class`,
                failure: `${process.env.FRONTEND_URL}/interfaces/failure.html`,
                pending: `${process.env.FRONTEND_URL}/interfaces/pending.html`
            },
            notification_url: envConfig.mercadoPago.webhookUrl,
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