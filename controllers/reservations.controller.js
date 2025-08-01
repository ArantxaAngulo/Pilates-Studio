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

const createReservationWithRetry = async (req, res, maxRetries = 3) => {
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            return await createReservationInternal(req, res);
        } catch (error) {
            if (error.message.includes('Write conflict') && retries < maxRetries - 1) {
                retries++;
                console.log(`Retrying reservation creation, attempt ${retries + 1}`);
                await new Promise(resolve => setTimeout(resolve, 100 * retries)); // Exponential backoff
            } else {
                console.error('Error creating reservation:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: error.message });
                }
                throw error;
            }
        }
    }
};

// Updated createReservation function for the backend
exports.createReservation = async (req, res) => {
    try {
        await createReservationWithRetry(req, res);
    } catch (error) {
        // Error already logged and response sent in createReservationWithRetry.
    }
};

const createReservationInternal = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        const result = await session.withTransaction(async () => {
            const { userId, sessionId, purchaseId, paymentMethod } = req.body;

            if (!userId || !sessionId || !paymentMethod) {
                throw new Error('userId, sessionId, and paymentMethod are required');
            }

            const classSession = await ClassSession.findById(sessionId).session(session);
            if (!classSession) {
                throw new Error('Class session not found');
            }
            if (classSession.reservedCount >= classSession.capacity) {
                throw new Error('Class session is full');
            }
            if (classSession.startsAt <= new Date()) {
                throw new Error('Cannot book past or ongoing sessions');
            }

            // For package reservations: Check for existing completed reservation
            if (paymentMethod === 'package') {
                const existingReservation = await Reservation.findOne({ userId, sessionId, paymentStatus: 'completed' }).session(session);
                if (existingReservation) {
                    throw new Error('User already has a reservation for this session');
                }
            }


            let newReservationDoc;

            if (paymentMethod === 'package') {
                if (!purchaseId) {
                    throw new Error('purchaseId is required for package reservations');
                }
                const purchase = await Purchase.findById(purchaseId).session(session);
                if (!purchase || purchase.userId.toString() !== userId) {
                    throw new Error('Valid purchase not found for this user');
                }
                if (purchase.creditsLeft <= 0) {
                    throw new Error('No credits remaining in this package');
                }
                if (purchase.expiresAt <= new Date()) {
                    throw new Error('Package has expired');
                }

                newReservationDoc = new Reservation({
                    userId,
                    sessionId,
                    purchaseId,
                    paymentStatus: 'completed',
                    paymentMethod: 'package',
                    reservedAt: new Date()
                });

                await Purchase.findByIdAndUpdate(purchaseId, { $inc: { creditsLeft: -1 } }, { session });

                const savedReservation = await newReservationDoc.save({ session });
                await ClassSession.findByIdAndUpdate(sessionId, { $inc: { reservedCount: 1 } }, { session });
                return { isPackage: true, reservation: savedReservation };
                
            } else if (paymentMethod === 'single_class') {
                // For single_class, DO NOT create the reservation yet.
                // Instead, return details for the client to initiate MercadoPago payment.
                // The actual reservation document will be created ONLY on payment success via webhook/success callback.

                // Check for existing COMPLETED reservation for this user/session
                const existingCompletedReservation = await Reservation.findOne({ userId, sessionId, paymentStatus: 'completed' }).session(session);
                if (existingCompletedReservation) {
                    throw new Error('User already has a completed reservation for this session.');
                }
                // If there's a pending single_class reservation that was abandoned (e.g. user hit back from MP),
                // we can safely remove it here to allow a fresh attempt.
                // This ensures old pending records don't linger if a new attempt is made for the same session.
                await Reservation.findOneAndDelete({ userId, sessionId, paymentStatus: 'pending', paymentMethod: 'single_class' }).session(session);


                const singleClassPrice = 270; // Set price from your business rules
                const classSessionName = classSession.classTypeId ? (await ClassSession.populate(classSession, { path: 'classTypeId', select: 'name' })).classTypeId.name : 'Pilates';

                return {
                    status: 'initiate_payment', // New status to signal frontend to proceed to payment initiation
                    userId: userId,
                    sessionId: sessionId,
                    singleClassPrice: singleClassPrice,
                    classSessionName: classSessionName
                };
                
            } else {
                throw new Error(`Invalid payment method: ${paymentMethod}`);
            }

        }, {
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority', j: true }
        });

        if (result.isPackage) {
            const populatedReservation = await Reservation.findById(result.reservation._id)
                .populate('userId', 'name email')
                .populate({
                    path: 'sessionId',
                    populate: {
                        path: 'classTypeId instructorId',
                        select: 'name description level'
                    }
                })
                .populate('purchaseId', 'packageId creditsLeft expiresAt');
            
            res.status(201).json({
                status: 'success',
                data: { reservation: populatedReservation }
            });

        } else if (result.status === 'initiate_payment') { // Check for the new status
            res.status(200).json({
                status: 'initiate_payment',
                data: {
                    userId: result.userId,
                    sessionId: result.sessionId,
                    singleClassPrice: result.singleClassPrice,
                    classSessionName: result.classSessionName
                },
                message: 'Ready to initiate payment for single class.'
            });
        } else {
            throw new Error('Reservation could not be created due to an unexpected transaction outcome.');
        }

    } catch (error) {
        throw error; 
    } finally {
        await session.endSession();
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

        if (req.user.role !== 'admin' && reservation.userId.toString() !== req.user.id) {
            await session.abortTransaction();
            return res.status(403).json({ error: 'Not authorized to cancel this reservation' });
        }

        if (reservation.sessionId.startsAt <= new Date()) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Cannot cancel past or ongoing sessions' });
        }

        // If a pending single_class reservation is cancelled, we simply delete it
        // and do not touch reservedCount, as it was never incremented (with the new flow, it won't exist at all unless paid)
        // This block is mostly for legacy pending reservations or if the webhook fails.
        if (reservation.paymentMethod === 'single_class' && reservation.paymentStatus === 'pending') {
            await Reservation.findByIdAndDelete(reservationId).session(session);
            await session.commitTransaction();
            return res.json({
                status: 'success',
                message: 'Pending single class reservation removed successfully'
            });
        }

        // For completed reservations, proceed with normal cancellation logic
        await Reservation.findByIdAndDelete(reservationId).session(session);

        if (reservation.paymentMethod === 'package' && reservation.purchaseId) {
            await Purchase.findByIdAndUpdate(
                reservation.purchaseId,
                { $inc: { creditsLeft: 1 } },
                { session }
            );
        }

        if (reservation.paymentStatus === 'completed') {
            await ClassSession.findByIdAndUpdate(
                reservation.sessionId._id,
                { $inc: { reservedCount: -1 } },
                { session }
            );
        }

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
        
        if (status === 'upcoming') {
            const sessions = await ClassSession.find({
                startsAt: { $gt: new Date() }
            }).select('_id');
            filter.sessionId = { $in: sessions.map(s => s._id) };
            filter.paymentStatus = 'completed'; 
        } else if (status === 'past') {
            const sessions = await ClassSession.find({
                startsAt: { $lte: new Date() }
            }).select('_id');
            filter.sessionId = { $in: sessions.map(s => s._id) };
            filter.paymentStatus = 'completed'; 
        } else if (status === 'pending_payment') {
            filter.paymentStatus = 'pending';
            filter.paymentMethod = 'single_class'; 
        } else {
            filter.paymentStatus = 'completed';
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

exports.getReservationById = async (req, res) => {
    try {
        const reservationId = req.params.id;
        
        const reservation = await Reservation.findById(reservationId)
            .populate('userId', 'name email')
            .populate({
                path: 'sessionId',
                populate: {
                    path: 'classTypeId instructorId',
                    select: 'name description level name bio'
                }
            })
            .populate('purchaseId', 'packageId creditsLeft expiresAt');

        if (!reservation) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        if (req.user.role !== 'admin' && reservation.userId._id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to view this reservation' });
        }

        res.json({
            status: 'success',
            data: { reservation }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET SESSION RESERVATIONS (for instructors/admin)
exports.getSessionReservations = async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        
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