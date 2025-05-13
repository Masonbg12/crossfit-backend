const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  wp_id: { type: Number, unique: true }, // WordPress post ID
  title: { type: String, required: true }, // Title of the WOD
  content: { type: String, required: true }, // Content of the WOD
  date: { type: Date, required: true }, // Date of the WOD
  images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Image' }], // References to GridFS file IDs
});

module.exports = mongoose.model('Post', postSchema);