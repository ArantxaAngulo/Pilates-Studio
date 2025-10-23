const mongoose = require('mongoose');
const Reservation = require('../schemas/reservations.model');
const ClassSession = require('../schemas/classSessions.model');
const Purchase = require('../schemas/purchases.model');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const businessRules = require('../config/businessRules.config');

// Initialize MercadoPago client for refunds
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || 'APP_USR-4434682279033323-072219-fecfdf1c4fb06a1c8a8dc1a2c582de6e'
});
const paymentClient = new Payment(client);

// Helper function to check if action is within 8 hours of class
// NOTE: This is used ONLY for cancellation policy validation
function isWithin8Hours(classStartTime) {
    const now = new Date();
    const classStart = new Date(classStartTime);
    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60); // Convert milliseconds to hours
    return hoursUntilClass < 8;
}

// Helper function to determine minimum booking hours based on class time
// Afternoon classes (4pm-8pm) require 4 hours, all others require 8 hours
function getMinimumBookingHours(classStartTime) {
    const classStart = new Date(classStartTime);
    const classHour = classStart.getHours();

    const { afternoonClassStartHour, afternoonClassEndHour, afternoonClassMinHours, minHoursBeforeClass } = businessRules.reservation;

    // Check if it's an afternoon class (4pm-8pm)
    if (classHour >= afternoonClassStartHour && classHour < afternoonClassEndHour) {
        return afternoonClassMinHours; // 4 hours for afternoon classes
    }

    return minHoursBeforeClass; // 8 hours for all other classes
}

// Helper function to check if booking is within the deadline
// Uses dynamic hours based on class time (afternoon vs morning/Saturday)
function isWithinBookingDeadline(classStartTime) {
    const now = new Date();
    const classStart = new Date(classStartTime);
    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);
    const requiredHours = getMinimumBookingHours(classStartTime);

    return hoursUntilClass < requiredHours;
}

// Helper function to process MercadoPago refund
async function processMercadoPagoRefund(paymentId, amount = null) {
    try {
        console.log(`Processing refund for payment ${paymentId}, amount: ${amount || 'full'}`);
        
        // Create refund request
        const refundData = amount ? { amount } : {}; // If no amount specified, it's a full refund
        
        const refund = await paymentClient.refund({
            id: paymentId,
            body: refundData
        });
        
        console.log('Refund processed successfully:', refund);
        return {
            success: true,
            refundId: refund.id,
            status: refund.status,
            amount: refund.amount
        };
    } catch (error) {
        console.error('Error processing MercadoPago refund:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

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
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { userId, sessionId, purchaseId, paymentMethod } = req.body;
        
        // Validate user is booking for themselves (unless admin)
        if (req.user.role !== 'admin' && userId !== req.user.id) {
            await session.abortTransaction();
            return res.status(403).json({ error: 'Not authorized to book for other users' });
        }

        // Get class session details
        const classSession = await ClassSession.findById(sessionId).session(session);
        
        if (!classSession) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Class session not found' });
        }

        // Check booking deadline (4 hours for afternoon classes, 8 hours for others)
        if (isWithinBookingDeadline(classSession.startsAt)) {
            const requiredHours = getMinimumBookingHours(classSession.startsAt);
            await session.abortTransaction();
            return res.status(400).json({
                error: `No se pueden hacer reservas con menos de ${requiredHours} horas de anticipación`,
                errorCode: 'WITHIN_BOOKING_DEADLINE',
                requiredHours
            });
        }

        // Check if class has already started or passed
        if (new Date(classSession.startsAt) <= new Date()) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Cannot book past or ongoing sessions' });
        }

        // Check capacity
        if (classSession.reservedCount >= classSession.capacity) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Class is full' });
        }

        // Check for duplicate reservation
        const existingReservation = await Reservation.findOne({
            userId,
            sessionId,
            status: { $ne: 'cancelled' }
        }).session(session);

        if (existingReservation) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'You already have a reservation for this class' });
        }

        // Handle package-based reservation
        if (paymentMethod === 'package' && purchaseId) {
            const purchase = await Purchase.findById(purchaseId).session(session);
            
            if (!purchase) {
                await session.abortTransaction();
                return res.status(404).json({ error: 'Purchase not found' });
            }

            if (purchase.userId.toString() !== userId) {
                await session.abortTransaction();
                return res.status(403).json({ error: 'This package does not belong to the user' });
            }

            if (purchase.creditsLeft <= 0) {
                await session.abortTransaction();
                return res.status(400).json({ error: 'No credits left in package' });
            }

            if (new Date(purchase.expiresAt) < new Date()) {
                await session.abortTransaction();
                return res.status(400).json({ error: 'Package has expired' });
            }

            // Deduct credit
            purchase.creditsLeft -= 1;
            await purchase.save({ session });
        }

        // Create reservation
        const newReservation = new Reservation({
            userId,
            sessionId,
            purchaseId: paymentMethod === 'package' ? purchaseId : null,
            paymentMethod,
            paymentStatus: paymentMethod === 'package' ? 'completed' : 'pending',
            status: 'confirmed',
            bookedAt: new Date()
        });

        await newReservation.save({ session });

        // Update class session reserved count
        classSession.reservedCount += 1;
        await classSession.save({ session });

        await session.commitTransaction();

        // Populate the reservation before sending response
        const populatedReservation = await Reservation.findById(newReservation._id)
            .populate('sessionId')
            .populate('userId', 'name email');

        res.status(201).json({
            status: 'success',
            data: {
                reservation: populatedReservation
            }
        });

    } catch (err) {
        await session.abortTransaction();
        console.error('Error creating reservation:', err);
        res.status(500).json({ error: err.message });
    } finally {
        session.endSession();
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


                const singleClassPrice = 250; // Set price from your business rules
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

// CANCEL RESERVATION (Updated with 8-hour rule and refunds)
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

        // Check authorization
        if (req.user.role !== 'admin' && reservation.userId.toString() !== req.user.id) {
            await session.abortTransaction();
            return res.status(403).json({ error: 'Not authorized to cancel this reservation' });
        }

        // Check if class has already started
        if (reservation.sessionId.startsAt <= new Date()) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Cannot cancel past or ongoing sessions' });
        }

        // Check 8-hour rule for cancellations
        const within8Hours = isWithin8Hours(reservation.sessionId.startsAt);
        
        let refundResult = null;
        let refunded = false;

        if (within8Hours) {
            // Within 8 hours - NO refund for package credits or money
            refunded = false;
        } else {
            // Outside 8 hours - Process refund based on payment method
            if (reservation.paymentMethod === 'package' && reservation.purchaseId) {
                // Refund package credit
                await Purchase.findByIdAndUpdate(
                    reservation.purchaseId,
                    { $inc: { creditsLeft: 1 } },
                    { session }
                );
                refunded = true;
            } else if (reservation.paymentMethod === 'single_class' && reservation.mercadoPagoPaymentId) {
                // Process MercadoPago refund for single class payment
                refundResult = await processMercadoPagoRefund(reservation.mercadoPagoPaymentId);
                refunded = refundResult?.success || false;
                
                if (!refunded) {
                    console.error('Refund failed but continuing with cancellation:', refundResult?.error);
                }
            }
        }

        // Update class session reserved count
        await ClassSession.findByIdAndUpdate(
            reservation.sessionId._id,
            { $inc: { reservedCount: -1 } },
            { session }
        );

        // DELETE the reservation from database
        await Reservation.findByIdAndDelete(reservationId).session(session);

        await session.commitTransaction();

        // Prepare response message
        let message;
        if (within8Hours) {
            message = 'Reserva cancelada. No se reembolsarán créditos ni dinero (cancelación dentro de las 8 horas previas a la clase)';
        } else if (reservation.paymentMethod === 'package') {
            message = 'Reserva cancelada exitosamente. Tu crédito ha sido reembolsado.';
        } else if (refundResult?.success) {
            message = 'Reserva cancelada exitosamente. El reembolso se procesará en 5-10 días hábiles.';
        } else {
            message = 'Reserva cancelada. Hubo un problema con el reembolso, por favor contacta soporte.';
        }

        res.json({
            status: 'success',
            message,
            refunded,
            refundDetails: refundResult,
            within8Hours
        });

    } catch (err) {
        await session.abortTransaction();
        console.error('Error cancelling reservation:', err);
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

// CHECK IF USER CAN BOOK/CANCEL A CLASS
exports.checkReservationEligibility = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const classSession = await ClassSession.findById(sessionId);
        
        if (!classSession) {
            return res.status(404).json({ error: 'Class session not found' });
        }
        
        const now = new Date();
        const classStart = new Date(classSession.startsAt);
        const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);
        
        res.json({
            canBook: hoursUntilClass >= 8 && classStart > now,
            canCancel: hoursUntilClass >= 8 && classStart > now,
            willGetRefund: hoursUntilClass >= 8,
            hoursUntilClass: Math.round(hoursUntilClass * 10) / 10,
            message: hoursUntilClass < 8 
                ? 'Las reservas y cancelaciones deben hacerse con al menos 8 horas de anticipación'
                : 'Puedes reservar o cancelar esta clase'
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};