const Reservation = require('../schemas/reservations.model');
const ClassSession = require('../schemas/classSessions.model');
const Purchase = require('../schemas/purchases.model');
const mongoose = require('mongoose');

// GET ALL RESERVATIONS
exports.getAllReservations = async (req, res) => {
    try {
        const { userId, sessionId, date, status, page = 1, limit = 10 } = req.query;
        
        let filter = {};
        
        if (userId) {
            filter.userId = userId;
        }
        
        if (sessionId) {
            filter.sessionId = sessionId;
        }
        
        if (date) {
            // Find reservations for sessions on a specific date
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            
            const sessions = await ClassSession.find({
                startsAt: { $gte: startDate, $lt: endDate }
            }).select('_id');
            
            filter.sessionId = { $in: sessions.map(s => s._id) };
        }

        const skip = (page - 1) * limit;
        
        const reservations = await Reservation.find(filter)
            .populate('userId', 'name email')
            .populate({
                path: 'sessionId',
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level name bio'
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
};

// GET RESERVATION BY ID
exports.getReservationById = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id)
            .populate('userId', 'name email dob')
            .populate({
                path: 'sessionId',
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level defaultCapacity name bio certifications'
                }
            })
            .populate('purchaseId', 'packageId creditsLeft expiresAt boughtAt');
            
        if (!reservation) {
            return res.status(404).json({ error: 'Reservation not found' });
        }
        
        res.json({
            status: 'success',
            data: { reservation }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE NEW RESERVATION
exports.createReservation = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { userId, sessionId, purchaseId } = req.body;

        // Validate required fields
        if (!userId || !sessionId || !purchaseId) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: {
                    userId: !userId ? 'User ID is required' : undefined,
                    sessionId: !sessionId ? 'Session ID is required' : undefined,
                    purchaseId: !purchaseId ? 'Purchase ID is required' : undefined
                }
            });
        }

        // Check if class session exists and has available spots
        const classSession = await ClassSession.findById(sessionId).session(session);
        if (!classSession) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Class session not found' });
        }

        if (classSession.reservedCount >= classSession.capacity) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Class session is full' });
        }

        // Check if session is in the future
        if (classSession.startsAt <= new Date()) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Cannot book past or ongoing sessions' });
        }

        // Check if user already has a reservation for this session
        const existingReservation = await Reservation.findOne({
            userId,
            sessionId
        }).session(session);

        if (existingReservation) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'User already has a reservation for this session' });
        }

        // Verify purchase exists and has credits
        const purchase = await Purchase.findById(purchaseId).session(session);
        if (!purchase) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Purchase not found' });
        }

        if (purchase.userId.toString() !== userId) {
            await session.abortTransaction();
            return res.status(403).json({ error: 'Purchase does not belong to this user' });
        }

        if (purchase.creditsLeft <= 0) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'No credits remaining in this package' });
        }

        if (purchase.expiresAt <= new Date()) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Package has expired' });
        }

        // Create reservation
        const reservation = await Reservation.create([{
            userId,
            sessionId,
            purchaseId,
            reservedAt: new Date()
        }], { session });

        // Decrease credits and increase reserved count
        await Purchase.findByIdAndUpdate(
            purchaseId,
            { $inc: { creditsLeft: -1 } },
            { session }
        );

        await ClassSession.findByIdAndUpdate(
            sessionId,
            { $inc: { reservedCount: 1 } },
            { session }
        );

        await session.commitTransaction();

        // Get populated reservation for response
        const populatedReservation = await Reservation.findById(reservation[0]._id)
            .populate('userId', 'name email')
            .populate({
                path: 'sessionId',
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level name bio'
                }
            })
            .populate('purchaseId', 'packageId creditsLeft expiresAt');

        res.status(201).json({
            status: 'success',
            data: { reservation: populatedReservation }
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

// CANCEL RESERVATION
exports.cancelReservation = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const reservationId = req.params.id;
        
        const reservation = await Reservation.findById(reservationId)
            .populate('sessionId')
            .session(session);
            
        if (!reservation) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Reservation not found' });
        }

        // Check if user owns this reservation (if not admin)
        if (req.user.role !== 'admin' && reservation.userId.toString() !== req.user.id) {
            await session.abortTransaction();
            return res.status(403).json({ error: 'Not authorized to cancel this reservation' });
        }

        // Check if session hasn't started yet (allow cancellation up to session start)
        if (reservation.sessionId.startsAt <= new Date()) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Cannot cancel past or ongoing sessions' });
        }

        // Delete reservation
        await Reservation.findByIdAndDelete(reservationId).session(session);

        // Restore credit and decrease reserved count
        await Purchase.findByIdAndUpdate(
            reservation.purchaseId,
            { $inc: { creditsLeft: 1 } },
            { session }
        );

        await ClassSession.findByIdAndUpdate(
            reservation.sessionId._id,
            { $inc: { reservedCount: -1 } },
            { session }
        );

        await session.commitTransaction();

        res.json({
            status: 'success',
            message: 'Reservation cancelled successfully'
        });

    } catch (err) {
        await session.abortTransaction();
        res.status(500).json({ error: err.message });
    } finally {
        session.endSession();
    }
};

// GET USER RESERVATIONS
exports.getUserReservations = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { status = 'all', page = 1, limit = 10 } = req.query;
        
        let filter = { userId };
        
        // Filter by status
        if (status === 'upcoming') {
            const sessions = await ClassSession.find({
                startsAt: { $gt: new Date() }
            }).select('_id');
            filter.sessionId = { $in: sessions.map(s => s._id) };
        } else if (status === 'past') {
            const sessions = await ClassSession.find({
                startsAt: { $lte: new Date() }
            }).select('_id');
            filter.sessionId = { $in: sessions.map(s => s._id) };
        }

        const skip = (page - 1) * limit;
        
        const reservations = await Reservation.find(filter)
            .populate({
                path: 'sessionId',
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level name bio'
                }
            })
            .populate('purchaseId', 'packageId creditsLeft expiresAt')
            .sort({ 'sessionId.startsAt': 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Reservation.countDocuments(filter);

        res.json({
            status: 'success',
            data: {
                reservations,
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

// GET SESSION RESERVATIONS (for instructors/admin)
exports.getSessionReservations = async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        
        // Verify session exists
        const session = await ClassSession.findById(sessionId)
            .populate('classTypeId', 'name description level')
            .populate('instructorId', 'name bio');
            
        if (!session) {
            return res.status(404).json({ error: 'Class session not found' });
        }

        const reservations = await Reservation.find({ sessionId })
            .populate('userId', 'name email')
            .populate('purchaseId', 'packageId creditsLeft expiresAt')
            .sort({ reservedAt: 1 });

        res.json({
            status: 'success',
            data: {
                session,
                reservations,
                count: reservations.length,
                availableSpots: session.capacity - session.reservedCount
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};