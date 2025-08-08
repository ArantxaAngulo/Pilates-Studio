const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const reservationsSchema = new mongoose.Schema({
    userId: {
      type: Types.ObjectId,
      ref: 'users',
      required: true
    },
    sessionId: {
      type: Types.ObjectId,
      ref: 'ClassSession',
      required: true
    },
    purchaseId: {
      type: Types.ObjectId,
      ref: 'Purchase',
      required: function() {  // Make required only for package reservations
        return this.paymentMethod === 'package';
      }
    },
    reservedAt: {
      type: Date,
      default: Date.now
    },
    paymentStatus: {
        type: String,
        enum: ['completed', 'pending', 'failed'],
        default: 'completed'
    },
    paymentMethod: {
        type: String,
        enum: ['package', 'single_class'],
        required: true // Explicitly require payment method
    },
    singleClassPrice: {
        type: Number,
        default: null,
        required: function() {  // Required for single class
            return this.paymentMethod === 'single_class';
        }
    },
    mercadoPagoPaymentId: {
        type: String,
        default: null
    },
    paymentCompletedAt: {
        type: Date,
        default: null
    },
    
    // CANCELLATION AND REFUND FIELDS
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'no_show'],
        default: 'confirmed'
    },
    cancelledAt: {
        type: Date,
        default: null
    },
    cancellationReason: {
        type: String,
        default: null
    },
    cancelledBy: {
        type: Types.ObjectId,
        ref: 'users',
        default: null
    },
    
    // REFUND TRACKING
    refundStatus: {
        type: String,
        enum: ['pending', 'refunded', 'failed', 'not_eligible', null],
        default: null
    },
    refundId: {
        type: String,  // MercadoPago refund ID
        default: null
    },
    refundAmount: {
        type: Number,
        default: null
    },
    refundProcessedAt: {
        type: Date,
        default: null
    },
    refundFailureReason: {
        type: String,
        default: null
    },
    
    // 8-HOUR RULE TRACKING
    cancelledWithin8Hours: {
        type: Boolean,
        default: false
    },
    bookedWithin8Hours: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true  // Adds createdAt and updatedAt automatically
});

// INDEXES for better query performance
reservationsSchema.index({ userId: 1, sessionId: 1 });
reservationsSchema.index({ sessionId: 1, status: 1 });
reservationsSchema.index({ userId: 1, status: 1, reservedAt: -1 });
reservationsSchema.index({ mercadoPagoPaymentId: 1 });

// VIRTUAL to check if cancellation is within refund window
reservationsSchema.virtual('isRefundable').get(function() {
    if (!this.sessionId || !this.sessionId.startsAt) return false;
    
    const now = new Date();
    const classStart = new Date(this.sessionId.startsAt);
    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);
    
    return hoursUntilClass >= 8;
});

// METHOD to check if reservation can be cancelled
reservationsSchema.methods.canBeCancelled = function() {
    return this.status === 'confirmed' && 
           this.sessionId && 
           new Date(this.sessionId.startsAt) > new Date();
};

// METHOD to calculate refund eligibility
reservationsSchema.methods.calculateRefundEligibility = function() {
    if (this.status !== 'confirmed') {
        return { eligible: false, reason: 'Reservation not confirmed' };
    }
    
    if (!this.sessionId || !this.sessionId.startsAt) {
        return { eligible: false, reason: 'Session information missing' };
    }
    
    const now = new Date();
    const classStart = new Date(this.sessionId.startsAt);
    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);
    
    if (classStart <= now) {
        return { eligible: false, reason: 'Class has already started' };
    }
    
    if (hoursUntilClass < 8) {
        return { 
            eligible: false, 
            reason: 'Cancellation within 8 hours of class start',
            hoursUntilClass: Math.round(hoursUntilClass * 10) / 10
        };
    }
    
    return { 
        eligible: true, 
        reason: 'Eligible for refund',
        hoursUntilClass: Math.round(hoursUntilClass * 10) / 10
    };
};

module.exports = model('Reservation', reservationsSchema);