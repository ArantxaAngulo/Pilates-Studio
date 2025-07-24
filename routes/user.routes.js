const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const rateLimit = require('express-rate-limit');

// RATE LIMITING
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login attempts per windowMs
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 registration attempts per hour
    message: 'Too many registration attempts, please try again later'
});

// PUBLIC ROUTES (no authentication required)
// User registration
router.post('/register', registerLimiter, userController.createUser);

// User login update
router.post('/login', loginLimiter, (req, res, next) => {
    userController.loginUser(req, res).catch(next);
});

// Refresh JWT token
router.post('/refresh-token', userController.refreshToken);

// PROTECTED ROUTES (require authentication)
router.use(verifyToken);

// Get user profile (own profile or admin viewing any)
router.get('/:id', validateUserAccess, userController.getUserById);

// Update user profile (own profile or admin updating any)
router.put('/:id', validateUserAccess, userController.updateUser);

// Get user dashboard data (own dashboard or admin viewing any)
router.get('/:id/dashboard', validateUserAccess, userController.getUserDashboard);

// Change password (own password or admin changing any)
router.put('/:id/change-password', validateUserAccess, userController.changePassword);

// ADMIN ONLY ROUTES
// Get all users
router.get('/', requireAdmin, userController.getAllUsers);

// Delete user
router.delete('/:id', requireAdmin, userController.deleteUser);

// Get user statistics
router.get('/admin/stats', requireAdmin, userController.getUserStats);

// Middleware to validate user can access their own data or admin can access any
function validateUserAccess(req, res, next) {
    const requestedUserId = req.params.id;
    
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