const User = require('../schemas/user.model');
const Purchase = require('../schemas/purchases.model');
const Reservation = require('../schemas/reservations.model');
const jwt = require('jsonwebtoken');

// GET ALL USERS (Admin only)
exports.getAllUsers = async (req, res) => {
    try {
        const { search, role, page = 1, limit = 10, includeStats = false } = req.query;
        
        let filter = {};
        
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (role) {
            filter.role = role;
        }

        const skip = (page - 1) * limit;
        
        let users = await User.find(filter)
            .select('-password') // Never return passwords
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Include user statistics if requested
        if (includeStats === 'true') {
            users = await Promise.all(users.map(async (user) => {
                const userObj = user.toObject();
                
                // Get active package
                const activePackage = await Purchase.findOne({
                    userId: user._id,
                    expiresAt: { $gt: new Date() },
                    creditsLeft: { $gt: 0 }
                }).populate('packageId', 'name creditCount');

                // Get total purchases and reservations
                const totalPurchases = await Purchase.countDocuments({ userId: user._id });
                const totalReservations = await Reservation.countDocuments({ userId: user._id });

                userObj.stats = {
                    activePackage,
                    totalPurchases,
                    totalReservations
                };

                return userObj;
            }));
        }

        const total = await User.countDocuments(filter);

        res.json({
            status: 'success',
            data: {
                users,
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

// GET USER BY ID
exports.getUserById = async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Users can only view their own profile unless they're admin
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to view this user' });
        }

        const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's active package
        const activePackage = await Purchase.findOne({
            userId: user._id,
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        }).populate('packageId', 'name creditCount validDays price');

        // Get user statistics
        const totalPurchases = await Purchase.countDocuments({ userId: user._id });
        const totalReservations = await Reservation.countDocuments({ userId: user._id });
        
        const upcomingReservations = await Reservation.find({ userId: user._id })
            .populate({
                path: 'sessionId',
                match: { startsAt: { $gt: new Date() } },
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level name bio'
                }
            })
            .limit(5)
            .sort({ 'sessionId.startsAt': 1 });

        // Filter out reservations where sessionId is null (past sessions)
        const validUpcomingReservations = upcomingReservations.filter(r => r.sessionId);

        const userResponse = {
            ...user.toObject(),
            activePackage,
            stats: {
                totalPurchases,
                totalReservations,
                upcomingReservationsCount: validUpcomingReservations.length
            },
            upcomingReservations: validUpcomingReservations
        };
        
        res.json({
            status: 'success',
            data: { user: userResponse }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE USER (REGISTER)
exports.createUser = async (req, res) => {
    try {
        const { name, email, password, dob } = req.body;

        // Validate required fields
        if (!name || !email || !password || !dob) {
            return res.status(400).json({ 
                error: "Validation failed",
                details: {
                    name: !name ? "Name is required" : undefined,
                    email: !email ? "Email is required" : undefined,
                    password: !password ? "Password is required" : undefined,
                    dob: !dob ? "Date of birth is required" : undefined
                }
            });
        }

        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: "Validation failed",
                details: {
                    email: "Please enter a valid email address"
                }
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ 
                error: "Validation failed",
                details: {
                    password: "Password must be at least 8 characters long"
                }
            });
        }

        // Validate age (must be at least 16)
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        if (age < 16) {
            return res.status(400).json({ 
                error: "Validation failed",
                details: {
                    dob: "You must be at least 16 years old to register"
                }
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                error: "Validation failed",
                details: {
                    email: "Email already in use"
                }
            });
        }

        // Create new user
        const user = await User.create({ name, email, password, dob });
        
        // Generate JWT tokens
        const jwtSecret = process.env.JWT_SECRET || '123xyz';
        
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role || 'user' },
            jwtSecret,
            { expiresIn: '15m' }
        );

        const refreshToken = jwt.sign(
            { id: user._id },
            jwtSecret,
            { expiresIn: '7d' }
        );

        // Don't send password back
        user.password = undefined;

        res.status(201).json({
            status: 'success',
            token,
            refreshToken,
            expiresIn: 15 * 60,
            data: {
                user
            }
        });

    } catch (err) {
        // Handle Mongoose validation errors
        if (err.name === 'ValidationError') {
            const errors = {};
            Object.keys(err.errors).forEach(key => {
                errors[key] = err.errors[key].message;
            });
            return res.status(400).json({ 
                error: "Validation failed",
                details: errors
            });
        }
        res.status(500).json({ 
            error: "Server error",
            message: err.message 
        });
    }
};

// UPDATE USER INFO
exports.updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const { role, email, password, ...updateData } = req.body;

        // Users can only update their own profile unless they're admin
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to update this user' });
        }

        // Only admins can change roles
        if (role && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to change user roles' });
        }

        // If updating email, check if it's already taken
        if (email) {
            const existingUser = await User.findOne({ 
                email, 
                _id: { $ne: userId } 
            });
            if (existingUser) {
                return res.status(400).json({ 
                    error: 'Email already in use by another user' 
                });
            }
            updateData.email = email;
        }

        // If updating password, validate it
        if (password) {
            if (password.length < 8) {
                return res.status(400).json({ 
                    error: 'Password must be at least 8 characters long' 
                });
            }
            updateData.password = password;
        }

        // Add role if admin is updating it
        if (role && req.user.role === 'admin') {
            updateData.role = role;
        }

        const user = await User.findByIdAndUpdate(
            userId, 
            updateData, 
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            status: 'success',
            data: { user }
        });
    } catch (err) {
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
    }
};

// DELETE USER
exports.deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;

        // Users cannot delete themselves unless they're admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to delete users' });
        }

        // Check if user has active purchases or reservations
        const activePurchase = await Purchase.findOne({
            userId,
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        });

        if (activePurchase) {
            return res.status(400).json({ 
                error: 'Cannot delete user with active package. Please expire the package first.' 
            });
        }

        const upcomingReservations = await Reservation.countDocuments({
            userId,
            // Add session check for future sessions
        });

        if (upcomingReservations > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete user with upcoming reservations. Please cancel reservations first.' 
            });
        }

        const user = await User.findByIdAndDelete(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            status: 'success',
            message: 'User deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// LOGIN USER
exports.loginUser = async (req, res) => {
    console.log('Login attempt for:', req.body.email);
    
    if (!req.body || !req.body.email || !req.body.password) {
        console.log('Missing login fields:', req.body);
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    const { email, password } = req.body;
    
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role || 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        const refreshToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({  // Note the return statement
            token,
            refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed' }); // Note the return
    }
};

// REFRESH TOKEN
exports.refreshToken = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header is required' });
        }

        const refreshToken = authHeader.split(' ')[1];
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token is required' });
        }

        const jwtSecret = process.env.JWT_SECRET || '123xyz';
        
        jwt.verify(refreshToken, jwtSecret, async (err, decoded) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid refresh token' });
            }

            // Get fresh user data
            const user = await User.findById(decoded.id).select('-password');
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Generate new access token
            const newAccessToken = jwt.sign(
                { id: user._id, email: user.email, role: user.role || 'user' },
                jwtSecret,
                { expiresIn: '15m' }
            );

            res.json({ 
                token: newAccessToken,
                expiresIn: 15 * 60
            });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET USER DASHBOARD DATA
exports.getUserDashboard = async (req, res) => {
    try {
        const userId = req.params.userId || req.user.id;

        // Users can only view their own dashboard unless they're admin
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get active package
        const activePackage = await Purchase.findOne({
            userId,
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        }).populate('packageId', 'name creditCount validDays price');

        // Get upcoming reservations
        const upcomingReservations = await Reservation.find({ userId })
            .populate({
                path: 'sessionId',
                match: { startsAt: { $gt: new Date() } },
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level name bio'
                }
            })
            .sort({ 'sessionId.startsAt': 1 })
            .limit(5);

        // Filter valid reservations
        const validUpcomingReservations = upcomingReservations.filter(r => r.sessionId);

        // Get recent purchase history
        const recentPurchases = await Purchase.find({ userId })
            .populate('packageId', 'name creditCount price')
            .sort({ boughtAt: -1 })
            .limit(3);

        // Get user statistics
        const totalPurchases = await Purchase.countDocuments({ userId });
        const totalReservations = await Reservation.countDocuments({ userId });
        
        // Calculate total spent
        const spendingData = await Purchase.aggregate([
            { $match: { userId: user._id } },
            {
                $lookup: {
                    from: 'packages',
                    localField: 'packageId',
                    foreignField: '_id',
                    as: 'package'
                }
            },
            { $unwind: '$package' },
            {
                $group: {
                    _id: null,
                    totalSpent: { $sum: '$package.price' }
                }
            }
        ]);

        const totalSpent = spendingData[0]?.totalSpent || 0;

        res.json({
            status: 'success',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    dob: user.dob,
                    createdAt: user.createdAt
                },
                activePackage,
                upcomingReservations: validUpcomingReservations,
                recentPurchases,
                statistics: {
                    totalPurchases,
                    totalReservations,
                    totalSpent,
                    memberSince: user.createdAt
                }
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET USER STATISTICS (Admin only)
exports.getUserStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const newUsersThisMonth = await User.countDocuments({
            createdAt: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
        });

        // Users with active packages
        const usersWithActivePackages = await Purchase.distinct('userId', {
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        });

        // Most active users (by reservation count)
        const mostActiveUsers = await Reservation.aggregate([
            {
                $group: {
                    _id: '$userId',
                    reservationCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 1,
                    name: '$user.name',
                    email: '$user.email',
                    reservationCount: 1
                }
            },
            { $sort: { reservationCount: -1 } },
            { $limit: 10 }
        ]);

        // User registration trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const registrationTrend = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            status: 'success',
            data: {
                overview: {
                    totalUsers,
                    newUsersThisMonth,
                    usersWithActivePackages: usersWithActivePackages.length,
                    activeUserPercentage: Math.round((usersWithActivePackages.length / totalUsers) * 100)
                },
                mostActiveUsers,
                registrationTrend
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CHANGE PASSWORD
exports.changePassword = async (req, res) => {
    try {
        const userId = req.params.id;
        const { currentPassword, newPassword } = req.body;

        // Users can only change their own password unless they're admin
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                error: 'Current password and new password are required' 
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ 
                error: 'New password must be at least 8 characters long' 
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password (unless admin is changing someone else's password)
        if (req.user.role !== 'admin' || userId === req.user.id) {
            const isCurrentPasswordValid = await user.comparePassword(currentPassword);
            if (!isCurrentPasswordValid) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({
            status: 'success',
            message: 'Password changed successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};