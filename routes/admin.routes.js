const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../schemas/user.model');
const Purchase = require('../schemas/purchases.model');
const Reservation = require('../schemas/reservations.model');
const ClassSession = require('../schemas/classSessions.model');
const Package = require('../schemas/packages.model');

// ADMIN WHITELIST
const ADMIN_EMAILS = ['admin@test.com']; 

// Custom admin verification middleware
async function verifyAdmin(req, res, next) {
    try {
        // Get token from header
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || '123xyz');
        
        // Check if user email is in admin whitelist
        if (!ADMIN_EMAILS.includes(decoded.email)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        // Verify user still exists
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        // Attach user to request
        req.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            isAdmin: true
        };
        
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
}

// Admin login endpoint (separate from regular user login)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if email is in admin whitelist
        if (!ADMIN_EMAILS.includes(email)) {
            return res.status(403).json({ error: 'Invalid admin credentials' });
        }
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(403).json({ error: 'Invalid admin credentials' });
        }
        
        // Verify password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(403).json({ error: 'Invalid admin credentials' });
        }
        
        // Generate admin token with special claim
        const token = jwt.sign(
            { 
                id: user._id.toString(), 
                email: user.email,
                isAdmin: true 
            },
            process.env.JWT_SECRET || '123xyz',
            { expiresIn: '24h' }
        );
        
        res.json({
            status: 'success',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: true
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// All other admin routes require admin verification
router.use(verifyAdmin);

// GET DASHBOARD STATISTICS
router.get('/dashboard/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPurchases = await Purchase.countDocuments();
        const totalReservations = await Reservation.countDocuments();
        
        // Active packages
        const activePurchases = await Purchase.countDocuments({
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        });
        
        // Today's reservations
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todaySessions = await ClassSession.find({
            startsAt: { $gte: today, $lt: tomorrow }
        }).select('_id');
        
        const todayReservations = await Reservation.countDocuments({
            sessionId: { $in: todaySessions.map(s => s._id) }
        });
        
        res.json({
            status: 'success',
            data: {
                totalUsers,
                totalPurchases,
                totalReservations,
                activePurchases,
                todayReservations
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET ALL USERS WITH DETAILED INFO
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const skip = (page - 1) * limit;
        
        let filter = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
            
        // Get additional info for each user
        const usersWithInfo = await Promise.all(users.map(async (user) => {
            const userObj = user.toObject();
            
            // Get active package
            const activePackage = await Purchase.findOne({
                userId: user._id,
                expiresAt: { $gt: new Date() },
                creditsLeft: { $gt: 0 }
            }).populate('packageId', 'name creditCount');
            
            // Get counts
            const totalPurchases = await Purchase.countDocuments({ userId: user._id });
            const totalReservations = await Reservation.countDocuments({ userId: user._id });
            
            return {
                ...userObj,
                activePackage: activePackage ? {
                    packageName: activePackage.packageId?.name || 'Unknown Package',
                    creditsLeft: activePackage.creditsLeft,
                    expiresAt: activePackage.expiresAt
                } : null,
                totalPurchases,
                totalReservations
            };
        }));
        
        const total = await User.countDocuments(filter);
        
        res.json({
            status: 'success',
            data: {
                users: usersWithInfo,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET ALL RESERVATIONS WITH USER INFO
router.get('/reservations', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all' } = req.query;
        const skip = (page - 1) * limit;
        
        let filter = {};
        
        // Filter by status (upcoming, past, all)
        if (status === 'upcoming') {
            const upcomingSessions = await ClassSession.find({
                startsAt: { $gte: new Date() }
            }).select('_id');
            filter.sessionId = { $in: upcomingSessions.map(s => s._id) };
        } else if (status === 'past') {
            const pastSessions = await ClassSession.find({
                startsAt: { $lt: new Date() }
            }).select('_id');
            filter.sessionId = { $in: pastSessions.map(s => s._id) };
        }
        
        const reservations = await Reservation.find(filter)
            .populate('userId', 'name email')
            .populate({
                path: 'sessionId',
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level bio'
                }
            })
            .populate('purchaseId', 'packageId creditsLeft expiresAt')
            .sort({ reservedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
            
        const total = await Reservation.countDocuments(filter);
        
        res.json({
            status: 'success',
            data: {
                reservations,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET ALL PURCHASES WITH USER INFO
router.get('/purchases', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all' } = req.query;
        const skip = (page - 1) * limit;
        
        let filter = {};
        
        // Filter by status
        if (status === 'active') {
            filter.expiresAt = { $gt: new Date() };
            filter.creditsLeft = { $gt: 0 };
        } else if (status === 'expired') {
            filter.expiresAt = { $lte: new Date() };
        } else if (status === 'used') {
            filter.creditsLeft = 0;
        }
        
        const purchases = await Purchase.find(filter)
            .populate('userId', 'name email')
            .sort({ boughtAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
            
        // Get package info for each purchase
        const purchasesWithPackageInfo = await Promise.all(purchases.map(async (purchase) => {
            const purchaseObj = purchase.toObject();
            
            // Try to get package from DB or static data
            let packageInfo = await Package.findById(purchase.packageId);
            
            if (!packageInfo) {
                // Fallback to static package data if needed
                const packagesData = require('../seed/packages.json');
                packageInfo = packagesData.find(pkg => pkg._id === purchase.packageId);
            }
            
            return {
                ...purchaseObj,
                packageInfo: packageInfo ? {
                    name: packageInfo.name,
                    creditCount: packageInfo.creditCount,
                    price: packageInfo.price,
                    validDays: packageInfo.validDays
                } : {
                    name: 'Unknown Package',
                    creditCount: 0,
                    price: 0,
                    validDays: 0
                }
            };
        }));
        
        const total = await Purchase.countDocuments(filter);
        
        res.json({
            status: 'success',
            data: {
                purchases: purchasesWithPackageInfo,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CANCEL RESERVATION (Admin can cancel any reservation)
router.delete('/reservations/:id', async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id)
            .populate('sessionId')
            .populate('purchaseId');
            
        if (!reservation) {
            return res.status(404).json({ error: 'Reservation not found' });
        }
        
        // Check if the session has already started
        if (new Date(reservation.sessionId.startsAt) < new Date()) {
            return res.status(400).json({ 
                error: 'Cannot cancel a reservation for a class that has already started' 
            });
        }
        
        // Refund credit if it was a package reservation
        if (reservation.paymentMethod === 'package' && reservation.purchaseId) {
            await Purchase.findByIdAndUpdate(
                reservation.purchaseId._id,
                { $inc: { creditsLeft: 1 } }
            );
        }
        
        // Update session reserved count
        await ClassSession.findByIdAndUpdate(
            reservation.sessionId._id,
            { $inc: { reservedCount: -1 } }
        );
        
        // Delete the reservation
        await Reservation.findByIdAndDelete(req.params.id);
        
        res.json({
            status: 'success',
            message: 'Reservation cancelled successfully',
            refunded: reservation.paymentMethod === 'package'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;