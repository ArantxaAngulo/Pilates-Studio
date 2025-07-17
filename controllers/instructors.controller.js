const Instructor = require('../schemas/instructors.model');

// GET ALL INSTRUCTORS
exports.getAllInstructors = async (req, res) => {
    try {
        const { search, certification, page = 1, limit = 10 } = req.query;
        
        let filter = {};
        
        if (search) {
            filter.$or = [
                { 'name.first': { $regex: search, $options: 'i' } },
                { 'name.last': { $regex: search, $options: 'i' } },
                { bio: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (certification) {
            filter.certifications = { $in: [certification] };
        }

        const skip = (page - 1) * limit;
        
        const instructors = await Instructor.find(filter)
            .sort({ 'name.first': 1, 'name.last': 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Instructor.countDocuments(filter);

        res.json({
            status: 'success',
            data: {
                instructors,
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

// GET INSTRUCTOR BY ID
exports.getInstructorById = async (req, res) => {
    try {
        const instructor = await Instructor.findById(req.params.id);
        
        if (!instructor) {
            return res.status(404).json({ error: 'Instructor not found' });
        }
        
        res.json({
            status: 'success',
            data: { instructor }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE NEW INSTRUCTOR
exports.createInstructor = async (req, res) => {
    try {
        const { name, bio, certifications, profilePictureUrl } = req.body;

        // Validate required fields
        if (!name || !name.first || !name.last) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: {
                    'name.first': !name?.first ? 'First name is required' : undefined,
                    'name.last': !name?.last ? 'Last name is required' : undefined
                }
            });
        }

        // Validate certifications array if provided
        if (certifications && !Array.isArray(certifications)) {
            return res.status(400).json({ 
                error: 'Certifications must be an array' 
            });
        }

        const instructor = await Instructor.create({
            name: {
                first: name.first,
                last: name.last
            },
            bio,
            certifications: certifications || [],
            profilePictureUrl
        });

        res.status(201).json({
            status: 'success',
            data: { instructor }
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

// UPDATE INSTRUCTOR
exports.updateInstructor = async (req, res) => {
    try {
        const { name, certifications } = req.body;

        // Validate name structure if being updated
        if (name && (!name.first || !name.last)) {
            return res.status(400).json({ 
                error: 'Both first and last name are required' 
            });
        }

        // Validate certifications array if provided
        if (certifications && !Array.isArray(certifications)) {
            return res.status(400).json({ 
                error: 'Certifications must be an array' 
            });
        }

        const instructor = await Instructor.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );

        if (!instructor) {
            return res.status(404).json({ error: 'Instructor not found' });
        }

        res.json({
            status: 'success',
            data: { instructor }
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

// DELETE INSTRUCTOR
exports.deleteInstructor = async (req, res) => {
    try {
        // Check if instructor has any upcoming class sessions
        const ClassSession = require('../models/classSessions.model');
        const upcomingSessions = await ClassSession.countDocuments({
            instructorId: req.params.id,
            startsAt: { $gte: new Date() }
        });

        if (upcomingSessions > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete instructor with upcoming class sessions' 
            });
        }

        const instructor = await Instructor.findByIdAndDelete(req.params.id);

        if (!instructor) {
            return res.status(404).json({ error: 'Instructor not found' });
        }

        res.json({
            status: 'success',
            message: 'Instructor deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET INSTRUCTOR SCHEDULE
exports.getInstructorSchedule = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const instructorId = req.params.id;

        // Verify instructor exists
        const instructor = await Instructor.findById(instructorId);
        if (!instructor) {
            return res.status(404).json({ error: 'Instructor not found' });
        }

        // Build date filter
        let dateFilter = { instructorId };
        
        if (startDate || endDate) {
            dateFilter.startsAt = {};
            if (startDate) {
                dateFilter.startsAt.$gte = new Date(startDate);
            }
            if (endDate) {
                dateFilter.startsAt.$lte = new Date(endDate);
            }
        } else {
            // Default to future sessions only
            dateFilter.startsAt = { $gte: new Date() };
        }

        const ClassSession = require('../models/classSessions.model');
        const schedule = await ClassSession.find(dateFilter)
            .populate('classTypeId', 'name description level')
            .sort({ startsAt: 1 });

        res.json({
            status: 'success',
            data: {
                instructor: {
                    _id: instructor._id,
                    name: instructor.name,
                    bio: instructor.bio
                },
                schedule,
                count: schedule.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ADD CERTIFICATION TO INSTRUCTOR
exports.addCertification = async (req, res) => {
    try {
        const { certification } = req.body;
        
        if (!certification) {
            return res.status(400).json({ error: 'Certification is required' });
        }

        const instructor = await Instructor.findById(req.params.id);
        
        if (!instructor) {
            return res.status(404).json({ error: 'Instructor not found' });
        }

        // Check if certification already exists
        if (instructor.certifications.includes(certification)) {
            return res.status(400).json({ 
                error: 'Instructor already has this certification' 
            });
        }

        instructor.certifications.push(certification);
        await instructor.save();

        res.json({
            status: 'success',
            data: { instructor }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// REMOVE CERTIFICATION FROM INSTRUCTOR
exports.removeCertification = async (req, res) => {
    try {
        const { certification } = req.body;
        
        if (!certification) {
            return res.status(400).json({ error: 'Certification is required' });
        }

        const instructor = await Instructor.findById(req.params.id);
        
        if (!instructor) {
            return res.status(404).json({ error: 'Instructor not found' });
        }

        // Remove certification from array
        instructor.certifications = instructor.certifications.filter(
            cert => cert !== certification
        );
        
        await instructor.save();

        res.json({
            status: 'success',
            data: { instructor }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};