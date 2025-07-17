const express = require('express');
const router = express.Router();
const classTypesController = require('../controllers/classTypes.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// PUBLIC ROUTES (no authentication required)
// Get all class types (for browsing)
router.get('/', classTypesController.getAllClassTypes);

// Get specific class type by ID
router.get('/:id', classTypesController.getClassTypeById);

// Get class types by level (Beginner, Intermediate, Advanced)
router.get('/level/:level', classTypesController.getClassTypesByLevel);

// ADMIN ONLY ROUTES
// Create new class type
router.post('/', verifyToken, requireAdmin, classTypesController.createClassType);

// Update class type
router.put('/:id', verifyToken, requireAdmin, classTypesController.updateClassType);

// Delete class type
router.delete('/:id', verifyToken, requireAdmin, classTypesController.deleteClassType);

// Middleware to check admin role
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = router;