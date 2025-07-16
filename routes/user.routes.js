const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const rateLimit = require('express-rate-limit');

// RATE LIMITING
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts, please try again later'
});
// REFRESH 
router.post('/refresh-token', userController.refreshToken);

// REGISTER ROUTE
router.post('/register', userController.createUser);

// LOGIN ROUTE (USING BCRYPT PASSWORD)
router.post('/login', userController.loginUser);

// PROTECTED ROUTES
router.put('/:id', verifyToken, userController.updateUser);
router.delete('/:id', verifyToken, userController.deleteUser);

module.exports = router;