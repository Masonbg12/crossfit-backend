const mongoose = require('mongoose');

const wodSchema = new mongoose.Schema({
  wp_id: { type: Number, unique: true }, // WordPress post ID (optional if importing from WordPress)
  title: { type: String, required: true }, // Title of the WOD
  description: { type: String, required: true }, // Description or content of the WOD
  date: { type: Date, required: true }, // Date of the WOD
  exercises: [String], // List of exercises (optional)
  duration: String, // Duration of the WOD (optional)
  images: { type: [String], default: [] }, // Array of image URLs
});

module.exports = mongoose.model('WOD', wodSchema);