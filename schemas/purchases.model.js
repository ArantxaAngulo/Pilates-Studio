const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

// "TICKET DE COMPRA"
const purchasesSchema = new mongoose.Schema({
    userId: {
      type: Types.ObjectId,
      ref: 'users',
      required: true
    },
    packageId: {
      type: String, // refers to packages._id
      ref: 'Packages',
      required: true
    },
    boughtAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    creditsLeft: {
      type: Number,
      required: true
    }
});
 
const Purchases = mongoose.model('Purchase', purchasesSchema);
module.exports = Purchases;