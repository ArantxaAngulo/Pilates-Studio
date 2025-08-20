const ClassSession = require('../schemas/classSessions.model');
const ClassType = require('../schemas/classTypes.model');
const Instructor = require('../schemas/instructors.model');
const mongoose = require('mongoose');

// GET AVAILABLE SESSIONS FOR BOOKING
exports.getAvailableSessions = async (req, res) => {
    try {
        const { date, month, year, classTypeId } = req.query;
        
        // Get current time for filtering past sessions
        const now = new Date();
        
        let filter = {
            startsAt: { $gte: now }, // Only future sessions (this already filters out past times)
            $expr: { $lt: ['$reservedCount', '$capacity'] } // Not fully booked
        };
        
        // Filter by specific date - EXTENDED TO CATCH TIMEZONE OVERLAP
        if (date) {
            // Parse the date string and set to beginning of day
            const searchDate = new Date(date);
            searchDate.setHours(0, 0, 0, 0);
            
            // Check if the requested date is today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isToday = searchDate.getTime() === today.getTime();
            
            // If it's today, use current time as start filter
            // Otherwise, use beginning of requested day
            const startFilter = isToday ? now : searchDate;
            
            // Extend the end time to 8 hours into the next day
            // This ensures we catch evening classes that might be stored as next day in UTC
            const extendedEnd = new Date(searchDate);
            extendedEnd.setDate(extendedEnd.getDate() + 1);
            extendedEnd.setHours(8, 0, 0, 0); // Extend to 8am next day in local time
            
            filter.startsAt = {
                $gte: startFilter, // Use current time if today, otherwise start of day
                $lt: extendedEnd
            };
            
            console.log('Date filter applied:', {
                requestedDate: date,
                isToday: isToday,
                filterStart: startFilter.toISOString(),
                filterEnd: extendedEnd.toISOString(),
                currentTime: now.toISOString()
            });
        }
        
        // Filter by month/year
        if (month && year) {
            const startOfMonth = new Date(year, month - 1, 1);
            const endOfMonth = new Date(year, month, 0, 23, 59, 59);
            
            // For month view, still respect the "only future sessions" rule
            filter.startsAt = {
                $gte: now, // Changed from startOfMonth to now
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

        // IMPORTANT: Filter sessions to only include those that actually belong to the requested date
        // in LOCAL time (not UTC)
        let filteredSessions = sessions;
        if (date) {
            const requestedDate = new Date(date);
            filteredSessions = sessions.filter(session => {
                const sessionLocal = new Date(session.startsAt);
                // Check if session is on the requested date
                const sameDate = sessionLocal.getDate() === requestedDate.getDate() &&
                               sessionLocal.getMonth() === requestedDate.getMonth() &&
                               sessionLocal.getFullYear() === requestedDate.getFullYear();
                
                // Also ensure the session hasn't already started (double-check)
                const isFuture = sessionLocal > now;
                
                return sameDate && isFuture;
            });
            
            console.log(`Filtered ${sessions.length} sessions to ${filteredSessions.length} for the requested date`);
        }

        // Group sessions by LOCAL date for easier frontend consumption
        const sessionsByDate = {};
        
        filteredSessions.forEach(session => {
            // Use LOCAL date for grouping
            const localDate = new Date(session.startsAt);
            const year = localDate.getFullYear();
            const month = String(localDate.getMonth() + 1).padStart(2, '0');
            const day = String(localDate.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;
            
            if (!sessionsByDate[dateKey]) {
                sessionsByDate[dateKey] = [];
            }
            
            // Add a flag to indicate if the session is in the past (for UI styling if needed)
            const sessionTime = new Date(session.startsAt);
            const isPast = sessionTime <= now;
            
            sessionsByDate[dateKey].push({
                _id: session._id,
                startsAt: session.startsAt,
                capacity: session.capacity,
                reservedCount: session.reservedCount,
                availableSpots: session.capacity - session.reservedCount,
                classType: session.classTypeId,
                instructor: session.instructorId,
                isPast: isPast, // Add this flag for frontend use
                time: new Date(session.startsAt).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                })
            });
        });
        
        // Sort each day's sessions by time
        Object.keys(sessionsByDate).forEach(dateKey => {
            sessionsByDate[dateKey].sort((a, b) => 
                new Date(a.startsAt) - new Date(b.startsAt)
            );
        });

        res.json({
            status: 'success',
            data: {
                availableSessions: filteredSessions,
                sessionsByDate,
                count: filteredSessions.length,
                serverTime: now.toISOString() // Send server time for debugging
            }
        });
    } catch (err) {
        console.error('Error fetching available sessions:', err);
        res.status(500).json({ 
            status: 'error',
            message: 'Error fetching available sessions',
            error: err.message 
        });
    }
};

// GET ALL CLASS SESSIONS
exports.getAllClassSessions = async (req, res) => {
    try {
        const { date, classTypeId, instructorId, available, startDate, endDate } = req.query;
        
        let filter = {};
        
        // Filter by specific date - EXTENDED TO CATCH TIMEZONE OVERLAP
        if (date) {
            const searchDate = new Date(date);
            searchDate.setHours(0, 0, 0, 0);
            
            // Extend to catch evening classes that might be next day in UTC
            const extendedEnd = new Date(searchDate);
            extendedEnd.setDate(extendedEnd.getDate() + 1);
            extendedEnd.setHours(8, 0, 0, 0);
            
            filter.startsAt = {
                $gte: searchDate,
                $lt: extendedEnd
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
            
        // If filtering by specific date, ensure we only return sessions for that LOCAL date
        let filteredSessions = sessions;
        if (date) {
            const requestedDate = new Date(date);
            filteredSessions = sessions.filter(session => {
                const sessionLocal = new Date(session.startsAt);
                return sessionLocal.getDate() === requestedDate.getDate() &&
                       sessionLocal.getMonth() === requestedDate.getMonth() &&
                       sessionLocal.getFullYear() === requestedDate.getFullYear();
            });
        }

        res.json({
            status: 'success',
            data: {
                classSessions: filteredSessions,
                count: filteredSessions.length
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