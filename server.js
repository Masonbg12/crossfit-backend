// external dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
require('dotenv').config();

// Import the WOD model
const POST = require('./postModel');

// Initialize Express app
const app = express();
app.use(cors({
  origin: "https://crossfit-website-n1pc.vercel.app",
  credentials: true
}));
app.use(express.json());

// Log the MongoDB URI
console.log("MONGO_URI:", process.env.MONGO_URI);

// Connect to MongoDB using Mongoose
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Multer GridFS storage setup
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (req, file) => {
    return {
      filename: `${Date.now()}-${file.originalname}`,
      bucketName: 'images'
    };
  }
});
const upload = multer({ storage });

// Get all WODs, include image URLs if available
app.get('/data', async (req, res) => {
  try {
    const wods = await POST.find();
    const mapped = wods.map(wod => {
      let imageUrl = null;
      if (wod.images && wod.images.length > 0) {
        // Use the first image as the main image
        imageUrl = `${req.protocol}://${req.get('host')}/images/${wod.images[0]}`;
      }
      return {
        ...wod.toObject(),
        imageUrl,
      };
    });
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch WODs" });
  }
});

// Serve images from GridFS
app.get('/images/:id', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'images' });
    const fileId = new mongoose.Types.ObjectId(req.params.id);

    const files = await db.collection('images.files').find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    res.set('Content-Type', files[0].contentType || 'image/jpeg');
    bucket.openDownloadStream(fileId).pipe(res);
  } catch (err) {
    res.status(404).json({ error: "Image not found" });
  }
});

// Helper function to remove image from the oldest post
async function removeImageFromOldestPost() {
  try {
    const db = mongoose.connection.db;
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'images' });

    // Find the oldest post with at least one image
    const oldestWithImage = await POST.findOne({ images: { $exists: true, $not: { $size: 0 } } }).sort({ date: 1 });
    if (oldestWithImage && oldestWithImage.images.length > 0) {
      for (const imgId of oldestWithImage.images) {
        try {
          await bucket.delete(imgId);
          console.log(`Deleted image: ${imgId} from post: ${oldestWithImage._id}`);
        } catch (err) {
          console.error(`Failed to delete image: ${imgId}`, err.message);
        }
      }
      oldestWithImage.images = [];
      await oldestWithImage.save();
      console.log(`Cleared images for oldest post: ${oldestWithImage._id}`);
    }
  } catch (err) {
    console.error("Error removing image from oldest post:", err.message);
  }
}

// Create a new WOD (with optional image upload)
app.post('/new-post', upload.single('images'), async (req, res) => {
  console.log("Received POST /new-post", req.body, req.file);

  // Defensive check for file upload errors
  if (req.file === undefined && req.headers['content-type']?.includes('multipart/form-data') && req.body.images) {
    return res.status(400).json({ error: "File upload failed. Please try again." });
  }

  try {
    // Find the current max number_id
    const lastPost = await POST.findOne().sort({ number_id: -1 }).select('number_id');
    let nextNumberId = 10872;
    if (lastPost && lastPost.number_id) {
      nextNumberId = lastPost.number_id + 1;
    }

    // Build the post object
    const postData = {
      date: req.body.date,
      title: req.body.title,
      content: req.body.content,
      images: req.file ? [req.file.id] : [],
      wp_id: nextNumberId,
    };

    const newWod = new POST(postData);
    const savedWod = await newWod.save();
    console.log("New WOD created:", savedWod);

    // Call cleanup function after new post is added
    await removeImageFromOldestPost();

    res.status(201).json(savedWod);
  } catch (err) {
    console.error("Error creating WOD:", err.message);
    res.status(400).json({ error: "Failed to create WOD", details: err.message });
  }
});

// Update an existing WOD by ID
app.put('/update-post/:id', upload.single('images'), async (req, res) => {
  try {
    // Build update object
    const updateData = {
      date: req.body.date,
      title: req.body.title,
      content: req.body.content,
    };
    if (req.file) {
      updateData.images = [req.file.id];
    }

    const updatedWod = await POST.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedWod) {
      return res.status(404).json({ error: "WOD not found" });
    }
    res.json(updatedWod);
  } catch (err) {
    res.status(400).json({ error: "Failed to update WOD", details: err.message });
  }
});

// Delete a WOD by ID
app.delete('/delete-post/:id', async (req, res) => {
  try {
    const deletedWod = await POST.findByIdAndDelete(req.params.id);
    if (!deletedWod) {
      return res.status(404).json({ error: "WOD not found" });
    }
    res.json({ message: "WOD deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete WOD", details: err.message });
  }
});

// Weekly cleanup: delete images from posts older than 2 years, but keep the posts
/*const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
setInterval(async () => {
  try {
    const db = mongoose.connection.db;
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'images' });
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // Find posts older than 2 years
    const oldPosts = await POST.find({ date: { $lt: twoYearsAgo } });
    for (const post of oldPosts) {
      // Delete associated images from GridFS
      if (post.images && post.images.length > 0) {
        for (const imgId of post.images) {
          try {
            await bucket.delete(imgId);
            console.log(`Deleted image: ${imgId}`);
          } catch (err) {
            console.error(`Failed to delete image: ${imgId}`, err.message);
          }
        }
        // Clear the images array for this post
        post.images = [];
        await post.save();
        console.log(`Cleared images for post: ${post._id}`);
      }
    }
  } catch (err) {
    console.error("Error during weekly cleanup:", err.message);
  }
}, ONE_WEEK);*/

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));