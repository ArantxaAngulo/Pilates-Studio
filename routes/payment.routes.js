const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// Create payment preference
router.post('/create_preference', paymentController.createPreference);
// Create sinle class payment preference
router.post('/create_single_class_preference', paymentController.createSingleClassPreference);

// Handle payment callbacks
router.get('/success', paymentController.handleSuccess);
router.get('/failure', paymentController.handleFailure);
router.get('/pending', paymentController.handlePending);

// Webhook for payment notifications
router.post('/webhook', paymentController.webhook);

router.post('/test-webhook', async (req, res) => {
    // Simulate a webhook with test data
    const testWebhookData = {
        id: '123456',
        type: 'payment',
        data: {
            id: '1324157574'
        }
    };
    
    // Call the webhook handler
    req.body = testWebhookData;
    return paymentController.webhook(req, res);
});

router.post('/test-purchase', async (req, res) => {
    const { userId, packageId } = req.body;
    
    try {
        const Purchase = require('../schemas/purchases.model');
        const Package = require('../schemas/packages.model');
        
        const package = await Package.findById(packageId);
        if (!package) {
            return res.status(404).json({ error: 'Package not found' });
        }
        
        const purchase = await Purchase.create({
            userId,
            packageId,
            boughtAt: new Date(),
            expiresAt: new Date(Date.now() + package.validDays * 86400000),
            creditsLeft: package.creditCount,
            mercadoPagoPaymentId: 'TEST_' + Date.now()
        });
        
        res.json({ 
            success: true, 
            purchase,
            message: 'Test purchase created successfully' 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
