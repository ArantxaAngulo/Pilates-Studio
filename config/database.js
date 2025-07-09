const mongoose = require('mongoose');

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log(' MongoDB connection success');
    } catch (err) {
        console.error(' Error in MongoDB connection:', err);
        process.exit(1);
    }
};

module.exports = connectDB;