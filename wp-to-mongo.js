// wp-to-mongo.js
require('dotenv').config(); // Load environment variables
const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser'); // Updated import

// Replace with your actual MongoDB URI and WordPress XML file path
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wordpressData';
const WORDPRESS_XML_PATH = process.env.WORDPRESS_XML_PATH || './your-wxr-file.xml';

// Mongoose schema for a WP Post
const postSchema = new mongoose.Schema({
  wp_id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  date: { type: Date, required: true },
  images: { type: [String], default: [] }, // Array of image URLs
});

const Post = mongoose.model('Post', postSchema);

async function importPosts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // Read and parse the WordPress XML file
    const xmlData = fs.readFileSync(WORDPRESS_XML_PATH, 'utf-8');
    const parser = new XMLParser(); // Create an instance of XMLParser
    const jsonData = parser.parse(xmlData); // Parse the XML data

    // Extract posts from the XML
    const posts = jsonData.rss.channel.item || [];
    console.log(`Found ${posts.length} posts in the XML file.`);

    for (let post of posts) {
      try {
        const content = post['content:encoded'] || ''; // Get content or default to an empty string
        const images = extractImageUrls(content);

        // Skip posts with empty content
        if (!content.trim()) {
          console.log(`Skipping post with ID ${post['wp:post_id']} due to missing content.`);
          continue;
        }

        const existing = await Post.findOne({ wp_id: post['wp:post_id'] });
        if (!existing) {
          await Post.create({
            wp_id: post['wp:post_id'],
            title: post.title || 'Untitled', // Provide a default title if missing
            content: content,
            date: new Date(post.pubDate),
            images: images,
          });
          console.log(`Post with ID ${post['wp:post_id']} imported.`);
        } else {
          console.log(`Post with ID ${post['wp:post_id']} already exists.`);
        }
      } catch (err) {
        console.error(`Error saving post with ID ${post['wp:post_id']}:`, err.message);
      }
    }

    console.log('Posts imported successfully!');
  } catch (err) {
    console.error('Error importing posts:', err.message);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit();
  }
}

// Helper function to extract image URLs from HTML content
function extractImageUrls(content) {
  const imageUrls = [];
  const regex = /<img[^>]+src="([^">]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imageUrls.push(match[1]);
  }
  return imageUrls;
}

importPosts();