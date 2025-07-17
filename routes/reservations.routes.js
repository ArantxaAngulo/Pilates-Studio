const express = require('express');
const router = express.Router();
const reservationsController = require('../controllers/reservations.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// ALL ROUTES REQUIRE AUTHENTICATION
router.use(verifyToken);

// USER ROUTES
// Get user's reservations (own data)
router.get('/user/:userId', validateUserAccess, reservationsController.getUserReservations);

// Create new reservation (book class)
router.post('/', reservationsController.createReservation);

// Cancel reservation
router.delete('/:id', reservationsController.cancelReservation);

// Get specific reservation by ID
router.get('/:id', reservationsController.getReservationById);

// INSTRUCTOR/ADMIN ROUTES
// Get all reservations for a specific session (instructors need this)
router.get('/session/:sessionId', requireInstructorOrAdmin, reservationsController.getSessionReservations);

// ADMIN ONLY ROUTES
// Get all reservations
router.get('/', requireAdmin, reservationsController.getAllReservations);

// Middleware to validate user can access their own data
function validateUserAccess(req, res, next) {
    const requestedUserId = req.params.userId;
    
    // Admins can access any user's data
    if (req.user.role === 'admin') {
        return next();
    }
    
    // Users can only access their own data
    if (requestedUserId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to access this user\'s reservations' });
    }
    
    next();
}

// Middleware to check instructor or admin role
function requireInstructorOrAdmin(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'instructor') {
        return res.status(403).json({ error: 'Instructor or admin access required' });
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