const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const reservationsSchema = new mongoose.Schema({
    userId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true
    },
    sessionId: {
      type: Types.ObjectId,
      ref: 'classSession',
      required: true
    },
    purchaseId: {
      type: Types.ObjectId,
      ref: 'Purchase',
      required: true
    },
    reservedAt: {
      type: Date,
      default: Date.now
    }
  });

  module.exports = model('Reservation', reservationsSchema);