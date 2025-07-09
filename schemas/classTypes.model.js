const mongoose = require('mongoose');

const classTypesSchema = new mongoose.Schema({
    _id: {
        type: String, // 'class-adv-10am'
        required: true
    },
    name: String,
    description: String,
    level: String, // "Beginner", "Advanced"
    defaultCapacity: {
      type: Number,
      default: 10
    }
  });

module.exports = mongoose.model('ClassType', classTypesSchema);