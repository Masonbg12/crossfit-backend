// external dependencies
const express = require('express'); // express server
const mongoose = require('mongoose'); // MongoDB
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors'); // cross-origin resource sharing
require('dotenv').config(); // load environment variables

// Import the WOD model
const WOD = require('./wodModel'); // import WOD model

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Log the MongoDB URI
console.log("MONGO_URI:", process.env.MONGO_URI);

// Connect to MongoDB using Mongoose
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Get all WODs
app.get('/data', async (req, res) => {
  try {
    const wods = await WOD.find(); // Fetch all WODs from the database
    console.log("Fetched WODs:", wods);
    res.json(wods);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch WODs" });
  }
});

// Create a new WOD
app.post('/', async (req, res) => {
  try {
    const newWod = new WOD(req.body); // Create a new WOD instance
    const savedWod = await newWod.save(); // Save the WOD to the database
    res.status(201).json(savedWod);
  } catch (err) {
    res.status(400).json({ error: "Failed to create WOD", details: err.message });
  }
});

// Update an existing WOD by ID
app.put('/:id', async (req, res) => {
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
app.delete('/:id', async (req, res) => {
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