const mongoose = require('mongoose');

const instructorsSchema = new mongoose.Schema({
    name: {
      first: String,
      last: String
    },
    bio: String,
    certifications: [String],
    profilePictureUrl: String
  });

module.exports = mongoose.model('Instructor', instructorsSchema);