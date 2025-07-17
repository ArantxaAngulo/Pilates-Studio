const express = require('express');
const router = express.Router();
const packagesController = require('../controllers/packages.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// PUBLIC ROUTES (no authentication required)
// Get all packages (for public viewing/purchasing)
router.get('/', packagesController.getAllPackages);

// Get specific package by ID
router.get('/:id', packagesController.getPackageById);

// Get packages by credit range
router.get('/filter/credits', packagesController.getPackagesByCredits);

// Get packages by price range
router.get('/filter/price', packagesController.getPackagesByPrice);

// PROTECTED ROUTES (require authentication)
// Get package statistics (for purchase decisions)
router.get('/:id/stats', verifyToken, packagesController.getPackageStats);

// ADMIN ONLY ROUTES
// Create new package
router.post('/', verifyToken, requireAdmin, packagesController.createPackage);

// Update package
router.put('/:id', verifyToken, requireAdmin, packagesController.updatePackage);

// Delete package
router.delete('/:id', verifyToken, requireAdmin, packagesController.deletePackage);

// Middleware to check admin role
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = router;