// external dependencies
const express = require('express'); // express server
const mongoose = require('mongoose'); // MongoDB
const cors = require('cors'); // cross-origin resource sharing
require('dotenv').config(); // load environment variables

// Import the WOD model
const WOD = require('./wodModel'); // import WOD model

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB using Mongoose
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Routes

// Get all WODs
app.get('/api/wods', async (req, res) => {
  try {
    const wods = await WOD.find(); // Fetch all WODs from the database
    res.json(wods);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch WODs" });
  }
});

// Get a single WOD
app.get('/api/wods/one', async (req, res) => {
  try {
    const wod = await WOD.findOne(); // Fetch one WOD from the database
    if (!wod) {
      return res.status(404).json({ error: "No WOD found" });
    }
    res.json(wod);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch WOD", details: err.message });
  }
});

// Create a new WOD
app.post('/api/wods', async (req, res) => {
  try {
    const newWod = new WOD(req.body); // Create a new WOD instance
    const savedWod = await newWod.save(); // Save the WOD to the database
    res.status(201).json(savedWod);
  } catch (err) {
    res.status(400).json({ error: "Failed to create WOD", details: err.message });
  }
});

// Update an existing WOD by ID
app.put('/api/wods/:id', async (req, res) => {
  try {
    const updatedWod = await WOD.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedWod) {
      return res.status(404).json({ error: "WOD not found" });
    }
    res.json(updatedWod);
  } catch (err) {
    res.status(400).json({ error: "Failed to update WOD", details: err.message });
  }
});

// Delete a WOD by ID
app.delete('/api/wods/:id', async (req, res) => {
  try {
    const deletedWod = await WOD.findByIdAndDelete(req.params.id);
    if (!deletedWod) {
      return res.status(404).json({ error: "WOD not found" });
    }
    res.json({ message: "WOD deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete WOD", details: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));