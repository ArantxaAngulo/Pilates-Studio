const ClassType = require('../schemas/classTypes.model');

// GET ALL CLASS TYPES
exports.getAllClassTypes = async (req, res) => {
    try {
        const { level, search } = req.query;
        
        let filter = {};
        
        if (level) {
            filter.level = level;
        }
        
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const classTypes = await ClassType.find(filter).sort({ name: 1 });

        res.json({
            status: 'success',
            data: {
                classTypes,
                count: classTypes.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET CLASS TYPE BY ID
exports.getClassTypeById = async (req, res) => {
    try {
        const classType = await ClassType.findById(req.params.id);
        
        if (!classType) {
            return res.status(404).json({ error: 'Class type not found' });
        }
        
        res.json({
            status: 'success',
            data: { classType }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE NEW CLASS TYPE
exports.createClassType = async (req, res) => {
    try {
        const { _id, name, description, level, defaultCapacity } = req.body;

        // Validate required fields
        if (!_id || !name) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: {
                    _id: !_id ? 'Class type ID is required' : undefined,
                    name: !name ? 'Name is required' : undefined
                }
            });
        }

        // Check if class type with this ID already exists
        const existingClassType = await ClassType.findById(_id);
        if (existingClassType) {
            return res.status(400).json({ 
                error: 'Class type with this ID already exists' 
            });
        }

        // Validate level if provided
        const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
        if (level && !validLevels.includes(level)) {
            return res.status(400).json({ 
                error: 'Invalid level. Must be: Beginner, Intermediate, or Advanced' 
            });
        }

        const classType = await ClassType.create({
            _id,
            name,
            description,
            level,
            defaultCapacity: defaultCapacity || 10
        });

        res.status(201).json({
            status: 'success',
            data: { classType }
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
                error: 'Class type with this ID already exists' 
            });
        }
        res.status(500).json({ error: err.message });
    }
};

// UPDATE CLASS TYPE
exports.updateClassType = async (req, res) => {
    try {
        const { level } = req.body;

        // Validate level if being updated
        if (level) {
            const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
            if (!validLevels.includes(level)) {
                return res.status(400).json({ 
                    error: 'Invalid level. Must be: Beginner, Intermediate, or Advanced' 
                });
            }
        }

        const classType = await ClassType.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );

        if (!classType) {
            return res.status(404).json({ error: 'Class type not found' });
        }

        res.json({
            status: 'success',
            data: { classType }
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

// DELETE CLASS TYPE
exports.deleteClassType = async (req, res) => {
    try {
        // Check if there are any class sessions using this type
        const ClassSession = require('../models/classSessions.model');
        const sessionsUsingType = await ClassSession.countDocuments({ 
            classTypeId: req.params.id 
        });

        if (sessionsUsingType > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete class type that is being used by existing sessions' 
            });
        }

        const classType = await ClassType.findByIdAndDelete(req.params.id);

        if (!classType) {
            return res.status(404).json({ error: 'Class type not found' });
        }

        res.json({
            status: 'success',
            message: 'Class type deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET CLASS TYPES BY LEVEL
exports.getClassTypesByLevel = async (req, res) => {
    try {
        const { level } = req.params;
        
        const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
        if (!validLevels.includes(level)) {
            return res.status(400).json({ 
                error: 'Invalid level. Must be: Beginner, Intermediate, or Advanced' 
            });
        }

        const classTypes = await ClassType.find({ level }).sort({ name: 1 });

        res.json({
            status: 'success',
            data: {
                classTypes,
                level,
                count: classTypes.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};