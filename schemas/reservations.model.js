const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const reservationsSchema = new mongoose.Schema({
    userId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true
    },
    sessionId: {
      type: ObjectId,
      ref: 'classSession',
      required: true
    },
    purchaseId: {
      type: ObjectId,
      ref: 'Purchase',
      required: true
    },
    reservedAt: {
      type: Date,
      default: Date.now
    }
  });

  module.exports = model('Reservation', reservationsSchema);