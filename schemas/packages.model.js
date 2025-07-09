const mongoose = require('mongoose');

// PAQUETES
const packagesSchema = new mongoose.Schema({
    _id: {
      type: String, // 'pkg150'
      required: true
    },
    name: {
      type: String,
      required: true
    },
    creditCount: {
      type: Number,
      required: true
    },
    validDays: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  });
  
  module.exports = mongoose.model('Packages', packagesSchema);