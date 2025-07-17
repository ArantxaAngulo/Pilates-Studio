const ClassSession = require('../schemas/classSessions.model');
const ClassType = require('../schemas/classTypes.model');
const Instructor = require('../schemas/instructors.model');

// GET ALL CLASS SESSIONS
exports.getAllClassSessions = async (req, res) => {
    try {
        const { date, classTypeId, instructorId, page = 1, limit = 10 } = req.query;
        
        // Build filter object
        let filter = {};
        
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            filter.startsAt = { $gte: startDate, $lt: endDate };
        }
        
        if (classTypeId) {
            filter.classTypeId = classTypeId;
        }
        
        if (instructorId) {
            filter.instructorId = instructorId;
        }

        const skip = (page - 1) * limit;
        
        const classSessions = await ClassSession.find(filter)
            .populate('classTypeId', 'name description level')
            .populate('instructorId', 'name bio')
            .sort({ startsAt: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await ClassSession.countDocuments(filter);

        res.json({
            status: 'success',
            data: {
                classSessions,
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

// GET CLASS SESSION BY ID
exports.getClassSessionById = async (req, res) => {
    try {
        const classSession = await ClassSession.findById(req.params.id)
            .populate('classTypeId', 'name description level defaultCapacity')
            .populate('instructorId', 'name bio certifications profilePictureUrl');
            
        if (!classSession) {
            return res.status(404).json({ error: 'Class session not found' });
        }
        
        res.json({
            status: 'success',
            data: { classSession }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE NEW CLASS SESSION
exports.createClassSession = async (req, res) => {
    try {
        const { classTypeId, startsAt, capacity, instructorId } = req.body;

        // Validate required fields
        if (!classTypeId || !startsAt) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: {
                    classTypeId: !classTypeId ? 'Class type is required' : undefined,
                    startsAt: !startsAt ? 'Start time is required' : undefined
                }
            });
        }

        // Verify class type exists
        const classType = await ClassType.findById(classTypeId);
        if (!classType) {
            return res.status(404).json({ error: 'Class type not found' });
        }

        // Verify instructor exists if provided
        if (instructorId) {
            const instructor = await Instructor.findById(instructorId);
            if (!instructor) {
                return res.status(404).json({ error: 'Instructor not found' });
            }
        }

        // Check for scheduling conflicts (same instructor, overlapping time)
        if (instructorId) {
            const sessionStart = new Date(startsAt);
            const sessionEnd = new Date(sessionStart.getTime() + 60 * 60 * 1000); // Assuming 1-hour sessions
            
            const conflictingSession = await ClassSession.findOne({
                instructorId,
                startsAt: {
                    $gte: sessionStart,
                    $lt: sessionEnd
                }
            });

            if (conflictingSession) {
                return res.status(400).json({ 
                    error: 'Instructor has a conflicting session at this time' 
                });
            }
        }

        const classSession = await ClassSession.create({
            classTypeId,
            startsAt,
            capacity: capacity || classType.defaultCapacity,
            instructorId,
            reservedCount: 0
        });

        const populatedSession = await ClassSession.findById(classSession._id)
            .populate('classTypeId', 'name description level')
            .populate('instructorId', 'name bio');

        res.status(201).json({
            status: 'success',
            data: { classSession: populatedSession }
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

// UPDATE CLASS SESSION
exports.updateClassSession = async (req, res) => {
    try {
        const { instructorId, startsAt } = req.body;

        // Verify instructor exists if updating
        if (instructorId) {
            const instructor = await Instructor.findById(instructorId);
            if (!instructor) {
                return res.status(404).json({ error: 'Instructor not found' });
            }
        }

        // Check for scheduling conflicts if updating instructor or time
        if (instructorId && startsAt) {
            const sessionStart = new Date(startsAt);
            const sessionEnd = new Date(sessionStart.getTime() + 60 * 60 * 1000);
            
            const conflictingSession = await ClassSession.findOne({
                _id: { $ne: req.params.id }, // Exclude current session
                instructorId,
                startsAt: {
                    $gte: sessionStart,
                    $lt: sessionEnd
                }
            });

            if (conflictingSession) {
                return res.status(400).json({ 
                    error: 'Instructor has a conflicting session at this time' 
                });
            }
        }

        const classSession = await ClassSession.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        )
        .populate('classTypeId', 'name description level')
        .populate('instructorId', 'name bio');

        if (!classSession) {
            return res.status(404).json({ error: 'Class session not found' });
        }

        res.json({
            status: 'success',
            data: { classSession }
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

// DELETE CLASS SESSION
exports.deleteClassSession = async (req, res) => {
    try {
        const classSession = await ClassSession.findById(req.params.id);
        
        if (!classSession) {
            return res.status(404).json({ error: 'Class session not found' });
        }

        // Check if session has reservations
        if (classSession.reservedCount > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete class session with existing reservations' 
            });
        }

        await ClassSession.findByIdAndDelete(req.params.id);

        res.json({
            status: 'success',
            message: 'Class session deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET AVAILABLE SESSIONS (for booking)
exports.getAvailableSessions = async (req, res) => {
    try {
        const { date, classTypeId } = req.query;
        
        let filter = {
            startsAt: { $gte: new Date() } // Only future sessions
        };
        
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            filter.startsAt = { $gte: startDate, $lt: endDate };
        }
        
        if (classTypeId) {
            filter.classTypeId = classTypeId;
        }

        const availableSessions = await ClassSession.find(filter)
            .populate('classTypeId', 'name description level')
            .populate('instructorId', 'name bio')
            .sort({ startsAt: 1 });

        // Filter sessions with available spots
        const sessionsWithAvailability = availableSessions.filter(session => 
            session.reservedCount < session.capacity
        );

        res.json({
            status: 'success',
            data: { 
                availableSessions: sessionsWithAvailability,
                count: sessionsWithAvailability.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};