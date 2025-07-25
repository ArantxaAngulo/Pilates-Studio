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
    }
});

  module.exports = model('Reservation', reservationsSchema);