const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// Create payment preference
router.post('/create_preference', paymentController.createPreference);

// Handle payment callbacks
router.get('/success', paymentController.handleSuccess);
router.get('/failure', paymentController.handleFailure);
router.get('/pending', paymentController.handlePending);

// Webhook for payment notifications
router.post('/webhook', paymentController.webhook);

module.exports = router;
