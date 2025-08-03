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
  origin: [
    process.env.FRONTEND_URL,
    process.env.LOCAL_FRONTEND_URL,
    `http://localhost:${process.env.PORT}`
  ],
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB using Mongoose
mongoose.connect(process.env.MONGO_URI, {  connectTimeoutMS: 3000, useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("MongoDB connected successfully");
    // Log connection details
    console.log("MongoDB connection state:", mongoose.connection.readyState);
  })
  .catch(err => {
    console.error("MongoDB connection error:", err.message);
    console.error("Full error:", err);
  });

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
        // Use HTTPS for production, HTTP for local development
        const protocol = req.get('host').includes('fly.dev') ? 'https' : req.protocol;
        imageUrl = `${protocol}://${req.get('host')}/images/${wod.images[0]}`;
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

  // Validate required fields
  if (!req.body.date || !req.body.title || !req.body.content) {
    return res.status(400).json({ 
      error: "Missing required fields", 
      missing: {
        date: !req.body.date,
        title: !req.body.title,
        content: !req.body.content
      }
    });
  }

  // Defensive check for file upload errors
  if (req.file === undefined && req.headers['content-type']?.includes('multipart/form-data') && req.body.images) {
    return res.status(400).json({ error: "File upload failed. Please try again." });
  }

  try {
    // Find the current max wp_id
    const lastPost = await POST.findOne().sort({ wp_id: -1 }).select('wp_id');
    let nextNumberId = 10872;
    if (lastPost && lastPost.wp_id) {
      nextNumberId = lastPost.wp_id + 1;
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

// Debug route to check server IP and connection info
app.get('/debug/ip', async (req, res) => {
  try {
    // Try to get external IP using a service
    let externalIP = 'Unable to determine';
    
    try {
      const response = await fetch('https://api.ipify.org?format=json', { timeout: 5000 });
      const data = await response.json();
      externalIP = data.ip;
    } catch (err) {
      console.error('Could not fetch external IP:', err.message);
    }

    // Check DNS resolution for MongoDB host
    let dnsInfo = {};
    try {
      const dns = require('dns').promises;
      const mongoHost = process.env.MONGO_URI ? new URL(process.env.MONGO_URI).hostname : 'unknown';
      
      if (mongoHost !== 'unknown') {
        const addresses = await dns.lookup(mongoHost, { all: true });
        dnsInfo.mongoHost = mongoHost;
        dnsInfo.resolvedAddresses = addresses;
        dnsInfo.ipv4Addresses = addresses.filter(addr => addr.family === 4);
        dnsInfo.ipv6Addresses = addresses.filter(addr => addr.family === 6);
      }
    } catch (err) {
      dnsInfo.error = err.message;
    }

    const debugInfo = {
      externalIP: externalIP,
      dnsResolution: dnsInfo,
      mongoConnectionState: mongoose.connection.readyState,
      mongoConnectionStates: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      },
      currentState: mongoose.connection.readyState === 1 ? 'connected' : 
                   mongoose.connection.readyState === 0 ? 'disconnected' :
                   mongoose.connection.readyState === 2 ? 'connecting' : 'disconnecting',
      host: req.get('host'),
      userAgent: req.get('user-agent'),
      requestIP: req.ip || req.connection.remoteAddress,
      headers: req.headers
    };

    console.log('Debug info requested:', debugInfo);
    res.json(debugInfo);
  } catch (err) {
    console.error('Debug route error:', err);
    res.status(500).json({ error: 'Debug info unavailable', details: err.message });
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
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
});