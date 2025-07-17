const express = require('express');
const router = express.Router();
const instructorsController = require('../controllers/instructors.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// PUBLIC ROUTES (no authentication required)
// Get all instructors (for public viewing)
router.get('/', instructorsController.getAllInstructors);

// Get specific instructor by ID
router.get('/:id', instructorsController.getInstructorById);

// PROTECTED ROUTES (require authentication)
// Get instructor schedule
router.get('/:id/schedule', verifyToken, instructorsController.getInstructorSchedule);

// ADMIN ONLY ROUTES
// Create new instructor
router.post('/', verifyToken, requireAdmin, instructorsController.createInstructor);

// Update instructor
router.put('/:id', verifyToken, requireAdmin, instructorsController.updateInstructor);

// Delete instructor
router.delete('/:id', verifyToken, requireAdmin, instructorsController.deleteInstructor);

// Add certification to instructor
router.post('/:id/certifications', verifyToken, requireAdmin, instructorsController.addCertification);

// Remove certification from instructor
router.delete('/:id/certifications', verifyToken, requireAdmin, instructorsController.removeCertification);

// Middleware to check admin role
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = router;