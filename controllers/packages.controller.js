const Package = require('../schemas/packages.model');

// GET ALL PACKAGES
exports.getAllPackages = async (req, res) => {
    try {
        const { sortBy = 'price', order = 'asc', minCredits, maxCredits, minPrice, maxPrice } = req.query;
        
        let filter = {};
        
        // Filter by credit count range
        if (minCredits || maxCredits) {
            filter.creditCount = {};
            if (minCredits) filter.creditCount.$gte = parseInt(minCredits);
            if (maxCredits) filter.creditCount.$lte = parseInt(maxCredits);
        }
        
        // Filter by price range
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = parseFloat(minPrice);
            if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
        }

        // Build sort object
        const sortOrder = order === 'desc' ? -1 : 1;
        const sortObj = {};
        sortObj[sortBy] = sortOrder;

        const packages = await Package.find(filter).sort(sortObj);

        res.json({
            status: 'success',
            data: {
                packages,
                count: packages.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET PACKAGE BY ID
exports.getPackageById = async (req, res) => {
    try {
        const package = await Package.findById(req.params.id);
        
        if (!package) {
            return res.status(404).json({ error: 'Package not found' });
        }
        
        res.json({
            status: 'success',
            data: { package }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE NEW PACKAGE
exports.createPackage = async (req, res) => {
    try {
        const { _id, name, creditCount, validDays, price } = req.body;

        // Validate required fields
        if (!_id || !name || !creditCount || !validDays || !price) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: {
                    _id: !_id ? 'Package ID is required' : undefined,
                    name: !name ? 'Name is required' : undefined,
                    creditCount: !creditCount ? 'Credit count is required' : undefined,
                    validDays: !validDays ? 'Valid days is required' : undefined,
                    price: !price ? 'Price is required' : undefined
                }
            });
        }

        // Validate numeric fields
        if (creditCount <= 0) {
            return res.status(400).json({ error: 'Credit count must be greater than 0' });
        }
        
        if (validDays <= 0) {
            return res.status(400).json({ error: 'Valid days must be greater than 0' });
        }
        
        if (price <= 0) {
            return res.status(400).json({ error: 'Price must be greater than 0' });
        }

        // Check if package with this ID already exists
        const existingPackage = await Package.findById(_id);
        if (existingPackage) {
            return res.status(400).json({ 
                error: 'Package with this ID already exists' 
            });
        }

        const package = await Package.create({
            _id,
            name,
            creditCount,
            validDays,
            price
        });

        res.status(201).json({
            status: 'success',
            data: { package }
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
        if (err.code === 11000) {
            return res.status(400).json({ 
                error: 'Package with this ID already exists' 
            });
        }
        res.status(500).json({ error: err.message });
    }
};

// UPDATE PACKAGE
exports.updatePackage = async (req, res) => {
    try {
        const { creditCount, validDays, price } = req.body;

        // Validate numeric fields if being updated
        if (creditCount && creditCount <= 0) {
            return res.status(400).json({ error: 'Credit count must be greater than 0' });
        }
        
        if (validDays && validDays <= 0) {
            return res.status(400).json({ error: 'Valid days must be greater than 0' });
        }
        
        if (price && price <= 0) {
            return res.status(400).json({ error: 'Price must be greater than 0' });
        }

        const package = await Package.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );

        if (!package) {
            return res.status(404).json({ error: 'Package not found' });
        }

        res.json({
            status: 'success',
            data: { package }
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

// DELETE PACKAGE
exports.deletePackage = async (req, res) => {
    try {
        // Check if package is being used in any purchases
        const Purchase = require('../models/purchases.model');
        const purchasesUsingPackage = await Purchase.countDocuments({ 
            packageId: req.params.id 
        });

        if (purchasesUsingPackage > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete package that has been purchased by users' 
            });
        }

        const package = await Package.findByIdAndDelete(req.params.id);

        if (!package) {
            return res.status(404).json({ error: 'Package not found' });
        }

        res.json({
            status: 'success',
            message: 'Package deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET PACKAGE STATISTICS
exports.getPackageStats = async (req, res) => {
    try {
        const packageId = req.params.id;
        
        const package = await Package.findById(packageId);
        if (!package) {
            return res.status(404).json({ error: 'Package not found' });
        }

        // Get purchase statistics for this package
        const Purchase = require('../models/purchases.model');
        
        const totalPurchases = await Purchase.countDocuments({ packageId });
        const activePurchases = await Purchase.countDocuments({ 
            packageId,
            expiresAt: { $gt: new Date() },
            creditsLeft: { $gt: 0 }
        });
        
        const expiredPurchases = await Purchase.countDocuments({ 
            packageId,
            expiresAt: { $lte: new Date() }
        });

        const fullyUsedPurchases = await Purchase.countDocuments({ 
            packageId,
            creditsLeft: 0
        });

        // Calculate revenue
        const totalRevenue = totalPurchases * package.price;

        res.json({
            status: 'success',
            data: {
                package,
                statistics: {
                    totalPurchases,
                    activePurchases,
                    expiredPurchases,
                    fullyUsedPurchases,
                    totalRevenue
                }
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET PACKAGES BY CREDIT RANGE
exports.getPackagesByCredits = async (req, res) => {
    try {
        const { min, max } = req.query;
        
        if (!min && !max) {
            return res.status(400).json({ 
                error: 'At least one of min or max credit count is required' 
            });
        }

        let filter = {};
        if (min) filter.creditCount = { $gte: parseInt(min) };
        if (max) {
            if (filter.creditCount) {
                filter.creditCount.$lte = parseInt(max);
            } else {
                filter.creditCount = { $lte: parseInt(max) };
            }
        }

        const packages = await Package.find(filter).sort({ creditCount: 1 });

        res.json({
            status: 'success',
            data: {
                packages,
                filters: { minCredits: min, maxCredits: max },
                count: packages.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET PACKAGES BY PRICE RANGE
exports.getPackagesByPrice = async (req, res) => {
    try {
        const { min, max } = req.query;
        
        if (!min && !max) {
            return res.status(400).json({ 
                error: 'At least one of min or max price is required' 
            });
        }

        let filter = {};
        if (min) filter.price = { $gte: parseFloat(min) };
        if (max) {
            if (filter.price) {
                filter.price.$lte = parseFloat(max);
            } else {
                filter.price = { $lte: parseFloat(max) };
            }
        }

        const packages = await Package.find(filter).sort({ price: 1 });

        res.json({
            status: 'success',
            data: {
                packages,
                filters: { minPrice: min, maxPrice: max },
                count: packages.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};