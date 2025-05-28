const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  // WordPress post ID
  wp_id: { type: Number, unique: true },
  // Title of the WOD
  title: { type: String, required: true },
  // Content of the WOD
  content: { type: String, required: true },
  // Date of the WOD
  date: { type: Date, required: true },
  // References to GridFS file IDs
  images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'images.files' }],
});
  

module.exports = mongoose.model('Post', postSchema);