const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const classSessionsSchema = new mongoose.Schema({
    classTypeId: {
      type: Types.ObjectId,
      ref: 'classType',
      required: true
    },
    startsAt: {
      type: Date,
      required: true,
      index: true
    },
    capacity: {
      type: Number,
      default: 10
    },
    reservedCount: {
      type: Number,
      default: 0
    },
    instructorId: {
      type: Types.ObjectId,
      ref: 'Instructor'
    }
  });

module.exports = mongoose.model('ClassSession', classSessionsSchema);