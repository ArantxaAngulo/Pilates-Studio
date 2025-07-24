const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema, model, Types } = mongoose;

// USUARIOS
const userSchema = new mongoose.Schema({
    name: { 
        type: String, required: [true, 'Name is required'] 
    },
    email: { 
        type: String, required: [true, 'Email is required'], 
        unique: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
     },
    password: { 
        type: String, required: [true, 'Password is required'] 
    },
    dob: {
        type: Date, required: [true, 'Date is required']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// hash password
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
      } catch (error) {
        throw new Error(error);
      }
};
  
module.exports = mongoose.model('users', userSchema);