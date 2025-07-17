const express = require('express');
const router = express.Router();
const classSessionsController = require('../controllers/classSessions.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// PUBLIC ROUTES (no authentication required)
// Get available sessions for booking
router.get('/available', classSessionsController.getAvailableSessions);

// PROTECTED ROUTES (require authentication)
// Get all class sessions with filtering
router.get('/', verifyToken, classSessionsController.getAllClassSessions);

// Get specific class session by ID
router.get('/:id', verifyToken, classSessionsController.getClassSessionById);

// ADMIN ONLY ROUTES
// Create new class session
router.post('/', verifyToken, requireAdmin, classSessionsController.createClassSession);

// Update class session
router.put('/:id', verifyToken, requireAdmin, classSessionsController.updateClassSession);

// Delete class session
router.delete('/:id', verifyToken, requireAdmin, classSessionsController.deleteClassSession);

// Middleware to check admin role
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = router;