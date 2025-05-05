const mongoose = require('mongoose');

const wodSchema = new mongoose.Schema({
  wp_id: { type: Number, unique: true }, // WordPress post ID (optional if importing from WordPress)
  title: { type: String, required: true }, // Title of the WOD
  content: { type: String, required: true }, // Content of the WOD
  date: { type: Date, required: true }, // Date of the WOD
  images: { type: [String], default: [] }, // Array of image URLs
});

module.exports = mongoose.model('WOD', wodSchema);