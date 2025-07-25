const ClassSession = require('../schemas/classSessions.model');
const ClassType = require('../schemas/classTypes.model');
const Instructor = require('../schemas/instructors.model');
const mongoose = require('mongoose');

// GET ALL CLASS SESSIONS
exports.getAllClassSessions = async (req, res) => {
    try {
        const { date, classTypeId, instructorId, available, startDate, endDate } = req.query;
        
        let filter = {};
        
        // Filter by specific date
        if (date) {
            const searchDate = new Date(date);
            const nextDay = new Date(searchDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            filter.startsAt = {
                $gte: searchDate,
                $lt: nextDay
            };
        }
        
        // Filter by date range
        if (startDate || endDate) {
            filter.startsAt = {};
            if (startDate) filter.startsAt.$gte = new Date(startDate);
            if (endDate) filter.startsAt.$lte = new Date(endDate);
        }
        
        // Filter by class type
        if (classTypeId) {
            filter.classTypeId = classTypeId;
        }
        
        // Filter by instructor
        if (instructorId) {
            filter.instructorId = instructorId;
        }
        
        // Filter only available sessions (not fully booked)
        if (available === 'true') {
            filter.$expr = { $lt: ['$reservedCount', '$capacity'] };
        }

        const sessions = await ClassSession.find(filter)
            .populate('classTypeId', 'name description level')
            .populate('instructorId', 'name bio')
            .sort({ startsAt: 1 });

        res.json({
            status: 'success',
            data: {
                classSessions: sessions,
                count: sessions.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET AVAILABLE SESSIONS FOR BOOKING
exports.getAvailableSessions = async (req, res) => {
    try {
        const { date, month, year, classTypeId } = req.query;
        
        let filter = {
            startsAt: { $gte: new Date() }, // Only future sessions
            $expr: { $lt: ['$reservedCount', '$capacity'] } // Not fully booked
        };
        
        // Filter by specific date
        if (date) {
            const searchDate = new Date(date);
            const nextDay = new Date(searchDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            filter.startsAt = {
                $gte: searchDate,
                $lt: nextDay
            };
        }
        
        // Filter by month/year
        if (month && year) {
            const startOfMonth = new Date(year, month - 1, 1);
            const endOfMonth = new Date(year, month, 0, 23, 59, 59);
            
            filter.startsAt = {
                $gte: startOfMonth,
                $lte: endOfMonth
            };
        }
        
        // Filter by class type
        if (classTypeId) {
            filter.classTypeId = classTypeId;
        }

        const sessions = await ClassSession.find(filter)
            .populate('classTypeId', 'name description level')
            .populate('instructorId', 'name bio')
            .sort({ startsAt: 1 });

        // Group sessions by date for easier frontend consumption
        const sessionsByDate = {};
        
        sessions.forEach(session => {
            const dateKey = new Date(session.startsAt).toISOString().split('T')[0];
            if (!sessionsByDate[dateKey]) {
                sessionsByDate[dateKey] = [];
            }
            sessionsByDate[dateKey].push({
                _id: session._id,
                startsAt: session.startsAt,
                capacity: session.capacity,
                reservedCount: session.reservedCount,
                availableSpots: session.capacity - session.reservedCount,
                classType: session.classTypeId,
                instructor: session.instructorId,
                time: new Date(session.startsAt).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                })
            });
        });

        res.json({
            status: 'success',
            data: {
                availableSessions: sessions,
                sessionsByDate,
                count: sessions.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET CLASS SESSION BY ID
exports.getClassSessionById = async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id)
            .populate('classTypeId', 'name description level defaultCapacity')
            .populate('instructorId', 'name bio certifications profilePictureUrl');
            
        if (!session) {
            return res.status(404).json({ error: 'Class session not found' });
        }
        
        // Add computed fields
        const sessionData = session.toObject();
        sessionData.availableSpots = session.capacity - session.reservedCount;
        sessionData.isFull = session.reservedCount >= session.capacity;
        sessionData.isPast = session.startsAt < new Date();
        
        res.json({
            status: 'success',
            data: { classSession: sessionData }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE NEW CLASS SESSION (Admin only)
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

        // Check for conflicting sessions (same time slot)
        const sessionDate = new Date(startsAt);
        const sessionEndTime = new Date(sessionDate.getTime() + 60 * 60 * 1000); // 1 hour duration
        
        const conflictingSession = await ClassSession.findOne({
            startsAt: {
                $gte: sessionDate,
                $lt: sessionEndTime
            }
        });

        if (conflictingSession) {
            return res.status(400).json({ 
                error: 'A class session already exists at this time slot' 
            });
        }

        const session = await ClassSession.create({
            classTypeId,
            startsAt: sessionDate,
            capacity: capacity || classType.defaultCapacity,
            reservedCount: 0,
            instructorId
        });

        const populatedSession = await ClassSession.findById(session._id)
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

// UPDATE CLASS SESSION (Admin only)
exports.updateClassSession = async (req, res) => {
    try {
        const { capacity, instructorId } = req.body;
        const sessionId = req.params.id;

        const session = await ClassSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Class session not found' });
        }

        // Prevent reducing capacity below current reservations
        if (capacity && capacity < session.reservedCount) {
            return res.status(400).json({ 
                error: `Cannot reduce capacity below current reservations (${session.reservedCount})` 
            });
        }

        // Verify instructor exists if being updated
        if (instructorId) {
            const instructor = await Instructor.findById(instructorId);
            if (!instructor) {
                return res.status(404).json({ error: 'Instructor not found' });
            }
        }

        const updatedSession = await ClassSession.findByIdAndUpdate(
            sessionId,
            { capacity, instructorId },
            { new: true, runValidators: true }
        )
        .populate('classTypeId', 'name description level')
        .populate('instructorId', 'name bio');

        res.json({
            status: 'success',
            data: { classSession: updatedSession }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// DELETE CLASS SESSION (Admin only)
exports.deleteClassSession = async (req, res) => {
    const mongooseSession = await mongoose.startSession();
    mongooseSession.startTransaction();
    
    try {
        const sessionId = req.params.id;
        
        const classSession = await ClassSession.findById(sessionId).session(mongooseSession);
        if (!classSession) {
            await mongooseSession.abortTransaction();
            return res.status(404).json({ error: 'Class session not found' });
        }

        // Check if there are reservations
        if (classSession.reservedCount > 0) {
            await mongooseSession.abortTransaction();
            return res.status(400).json({ 
                error: 'Cannot delete session with existing reservations. Cancel all reservations first.' 
            });
        }

        await ClassSession.findByIdAndDelete(sessionId).session(mongooseSession);
        
        await mongooseSession.commitTransaction();

        res.json({
            status: 'success',
            message: 'Class session deleted successfully'
        });
    } catch (err) {
        await mongooseSession.abortTransaction();
        res.status(500).json({ error: err.message });
    } finally {
        mongooseSession.endSession();
    }
};