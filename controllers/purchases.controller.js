const Purchase = require('../schemas/purchases.model');
const Package = require('../schemas/packages.model');
const User = require('../schemas/user.model');
const mongoose = require('mongoose');

// GET ALL PURCHASES (Admin only)
exports.getAllPurchases = async (req, res) => {
    try {
        const { userId, packageId, status, page = 1, limit = 10 } = req.query;
        
        let filter = {};
        
        if (userId) {
            filter.userId = userId;
        }
        
        if (packageId) {
            filter.packageId = packageId;
        }
        
        // Filter by status
        if (status) {
            const now = new Date();
            switch (status) {
                case 'active':
                    filter.expiresAt = { $gt: now };
                    filter.creditsLeft = { $gt: 0 };
                    break;
                case 'expired':
                    filter.expiresAt = { $lte: now };
                    break;
                case 'used':
                    filter.creditsLeft = 0;
                    break;
                case 'inactive':
                    filter.$or = [
                        { expiresAt: { $lte: now } },
                        { creditsLeft: 0 }
                    ];
                    break;
            }
        }

        const skip = (page - 1) * limit;
        
        const purchases = await Purchase.find(filter)
            .populate('userId', 'name email')
            .populate('packageId', 'name creditCount validDays price')
            .sort({ boughtAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Purchase.countDocuments(filter);

        res.json({
            status: 'success',
            data: {
                purchases,
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
};

// GET PURCHASE BY ID
exports.getPurchaseById = async (req, res) => {
    try {
        const purchase = await Purchase.findById(req.params.id)
            .populate('userId', 'name email dob')
            .populate('packageId', 'name creditCount validDays price');
            
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        // Check if user owns this purchase (unless admin)
        if (req.user.role !== 'admin' && purchase.userId._id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to view this purchase' });
        }
        
        res.json({
            status: 'success',
            data: { purchase }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE NEW PURCHASE (Buy Package)
exports.createPurchase = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { userId, packageId } = req.body;

        // Validate required fields
        if (!userId || !packageId) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: {
                    userId: !userId ? 'User ID is required' : undefined,
                    packageId: !packageId ? 'Package ID is required' : undefined
                }
            });
        }

        // Verify user exists
        const user = await User.findById(userId).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify package exists
        const package = await Package.findById(packageId).session(session);
        if (!package) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Package not found' });
        }

        // Check if user is trying to buy for themselves (unless admin)
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            await session.abortTransaction();
            return res.status(403).json({ error: 'Not authorized to purchase for other users' });
        }

        // BUSINESS RULE: Check if user already has an active package
        const activePurchase = await Purchase.findOne({
            userId,
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        }).session(session);

        if (activePurchase) {
            await session.abortTransaction();
            return res.status(400).json({ 
                error: 'User already has an active package',
                details: {
                    activePackage: activePurchase.packageId,
                    creditsLeft: activePurchase.creditsLeft,
                    expiresAt: activePurchase.expiresAt
                }
            });
        }

        // Calculate expiration date
        const boughtAt = new Date();
        const expiresAt = new Date(boughtAt);
        expiresAt.setDate(expiresAt.getDate() + package.validDays);

        // Create purchase
        const purchase = await Purchase.create([{
            userId,
            packageId,
            boughtAt,
            expiresAt,
            creditsLeft: package.creditCount
        }], { session });

        await session.commitTransaction();

        // Get populated purchase for response
        const populatedPurchase = await Purchase.findById(purchase[0]._id)
            .populate('userId', 'name email')
            .populate('packageId', 'name creditCount validDays price');

        res.status(201).json({
            status: 'success',
            data: { purchase: populatedPurchase }
        });

    } catch (err) {
        await session.abortTransaction();
        
        if (err.name === 'ValidationError') {
            const errors = {};
            Object.keys(err.errors).forEach(key => {
                errors[key] = err.errors[key].message;
            });
            return res.status(400).json({ 
                error: 'Validation failed',
                details: errors
            });
        }
        res.status(500).json({ error: err.message });
    } finally {
        session.endSession();
    }
};

// GET USER'S PURCHASE HISTORY
exports.getUserPurchases = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { status = 'all', page = 1, limit = 10 } = req.query;

        // Check if user is requesting their own purchases (unless admin)
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to view other users purchases' });
        }

        let filter = { userId };
        
        // Filter by status
        if (status !== 'all') {
            const now = new Date();
            switch (status) {
                case 'active':
                    filter.expiresAt = { $gt: now };
                    filter.creditsLeft = { $gt: 0 };
                    break;
                case 'expired':
                    filter.expiresAt = { $lte: now };
                    break;
                case 'used':
                    filter.creditsLeft = 0;
                    break;
                case 'inactive':
                    filter.$or = [
                        { expiresAt: { $lte: now } },
                        { creditsLeft: 0 }
                    ];
                    break;
            }
        }

        const skip = (page - 1) * limit;
        
        const purchases = await Purchase.find(filter)
            .populate('packageId', 'name creditCount validDays price')
            .sort({ boughtAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Purchase.countDocuments(filter);

        res.json({
            status: 'success',
            data: {
                purchases,
                status,
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
};

// GET USER'S ACTIVE PACKAGE
exports.getUserActivePackage = async (req, res) => {
    try {
        const userId = req.params.userId;

        // Check if user is requesting their own package (unless admin)
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to view other users packages' });
        }

        const activePurchase = await Purchase.findOne({
            userId,
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        })
        .populate('packageId', 'name creditCount validDays price')
        .populate('userId', 'name email');

        if (!activePurchase) {
            return res.json({
                status: 'success',
                data: { activePackage: null },
                message: 'No active package found'
            });
        }

        res.json({
            status: 'success',
            data: { activePackage: activePurchase }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// EXPIRE PACKAGE (Admin only - force expire)
exports.expirePackage = async (req, res) => {
    try {
        const purchaseId = req.params.id;

        const purchase = await Purchase.findById(purchaseId);
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        // Set expiration to now
        purchase.expiresAt = new Date();
        await purchase.save();

        const updatedPurchase = await Purchase.findById(purchaseId)
            .populate('userId', 'name email')
            .populate('packageId', 'name creditCount validDays price');

        res.json({
            status: 'success',
            data: { purchase: updatedPurchase },
            message: 'Package expired successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET PURCHASE STATISTICS
exports.getPurchaseStats = async (req, res) => {
    try {
        const now = new Date();
        
        // Get various counts
        const totalPurchases = await Purchase.countDocuments();
        const activePurchases = await Purchase.countDocuments({
            expiresAt: { $gt: now },
            creditsLeft: { $gt: 0 }
        });
        const expiredPurchases = await Purchase.countDocuments({
            expiresAt: { $lte: now }
        });
        const fullyUsedPurchases = await Purchase.countDocuments({
            creditsLeft: 0
        });

        // Calculate revenue
        const revenueData = await Purchase.aggregate([
            {
                $lookup: {
                    from: 'packages',
                    localField: 'packageId',
                    foreignField: '_id',
                    as: 'package'
                }
            },
            {
                $unwind: '$package'
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$package.price' },
                    averageOrderValue: { $avg: '$package.price' }
                }
            }
        ]);

        const revenue = revenueData[0] || { totalRevenue: 0, averageOrderValue: 0 };

        // Most popular packages
        const popularPackages = await Purchase.aggregate([
            {
                $group: {
                    _id: '$packageId',
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'packages',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'package'
                }
            },
            {
                $unwind: '$package'
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 5
            },
            {
                $project: {
                    _id: 1,
                    name: '$package.name',
                    count: 1
                }
            }
        ]);

        res.json({
            status: 'success',
            data: {
                overview: {
                    totalPurchases,
                    activePurchases,
                    expiredPurchases,
                    fullyUsedPurchases
                },
                revenue: {
                    totalRevenue: revenue.totalRevenue,
                    averageOrderValue: Math.round(revenue.averageOrderValue * 100) / 100
                },
                popularPackages
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CHECK IF USER CAN PURCHASE (Helper endpoint)
exports.canUserPurchase = async (req, res) => {
    try {
        const userId = req.params.userId;

        // Check if user is checking their own status (unless admin)
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const activePurchase = await Purchase.findOne({
            userId,
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        }).populate('packageId', 'name creditCount');

        const canPurchase = !activePurchase;

        res.json({
            status: 'success',
            data: {
                canPurchase,
                activePackage: activePurchase || null,
                reason: canPurchase ? 'No active package' : 'User has an active package'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};