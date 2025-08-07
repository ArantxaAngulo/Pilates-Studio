const express = require('express');
const router = express.Router();
const purchasesController = require('../controllers/purchases.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// ALL ROUTES REQUIRE AUTHENTICATION
router.use(verifyToken);

// USER ROUTES (users can access their own data)
// Get user's purchase history
router.get('/user/:userId', validateUserAccess, purchasesController.getUserPurchases);

// Get user's active package
router.get('/user/:userId/active', validateUserAccess, purchasesController.getUserActivePackage);

// Check if user can purchase new package
router.get('/user/:userId/can-purchase', validateUserAccess, purchasesController.canUserPurchase);

// Create new purchase (buy package)
router.post('/', purchasesController.createPurchase);

// Get specific purchase by ID
router.get('/:id', purchasesController.getPurchaseById);

// Check if user has purchased trial package
router.get('/check-trial/:userId', validateUserAccess, async (req, res) => {
    try {
        const { userId } = req.params;
        const Purchase = require('../schemas/purchases.model');
        
        // Check for trial package purchase
        const trialPurchase = await Purchase.findOne({
            userId,
            packageId: 'pkg-trial'
        });
        
        res.json({
            hasPurchasedTrial: !!trialPurchase,
            purchase: trialPurchase ? {
                id: trialPurchase._id,
                boughtAt: trialPurchase.boughtAt,
                expiresAt: trialPurchase.expiresAt
            } : null
        });
    } catch (error) {
        console.error('Error checking trial status:', error);
        res.status(500).json({ error: 'Error checking trial status' });
    }
});

// ADMIN ONLY ROUTES
// Get all purchases
router.get('/', requireAdmin, purchasesController.getAllPurchases);

// Get purchase statistics
router.get('/admin/stats', requireAdmin, purchasesController.getPurchaseStats);

// Force expire package
router.put('/:id/expire', requireAdmin, purchasesController.expirePackage);

// Middleware to validate user can access their own data
function validateUserAccess(req, res, next) {
    const requestedUserId = req.params.userId;
    
    // Admins can access any user's data
    if (req.user.role === 'admin') {
        return next();
    }
    
    // Users can only access their own data
    if (requestedUserId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to access this user\'s data' });
    }
    
    next();
}

// Middleware to check admin role
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = router;