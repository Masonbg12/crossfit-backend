// wp-to-mongo.js
require('dotenv').config(); // Load environment variables
const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');
const Grid = require('gridfs-stream');
const { Readable } = require('stream');

// Replace with your actual MongoDB URI and WordPress XML file path
const MONGO_URI = process.env.MONGO_URI;
const WORDPRESS_XML_PATH = process.env.WORDPRESS_XML_PATH;

// Mongoose schema for a WP Post
const Post = require('./postModel');

let gfs;
let gridfsBucket;

async function connectToMongoDB() {
  const connection = await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  // Initialize GridFS
  const db = mongoose.connection.db;
  gridfsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'images' });
  gfs = Grid(db, mongoose.mongo);
  gfs.collection('images');
}

async function saveImageToGridFS(url) {
  try {
    const response = await axios.get(url, { responseType: 'stream' });
    const filename = url.split('/').pop();

    const uploadStream = gridfsBucket.openUploadStream(filename);
    response.data.pipe(uploadStream);

    return new Promise((resolve, reject) => {
      uploadStream.on('finish', () => resolve(uploadStream.id));
      uploadStream.on('error', reject);
    });
  } catch (err) {
    console.error(`Error downloading image from ${url}:`, err.message);
    return null;
  }
}

async function importPosts() {
  try {
    await connectToMongoDB();

    // Read and parse the WordPress XML file
    const xmlData = fs.readFileSync(WORDPRESS_XML_PATH, 'utf-8');
    const parser = new XMLParser();
    const jsonData = parser.parse(xmlData);

    // Extract posts from the XML
    const posts = jsonData.rss.channel.item || [];
    console.log(`Found ${posts.length} posts in the XML file.`);

    for (let post of posts) {
      try {
        const content = post['content:encoded'] || '';
        const postDate = new Date(post.pubDate);
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        // Only include images if post is less than 2 years old
        const imageUrls =
          postDate >= twoYearsAgo
            ? extractImageUrls(content)
            : [];

        // Skip posts with empty content
        if (!content.trim()) {
          console.log(`Skipping post with ID ${post['wp:post_id']} due to missing content.`);
          continue;
        }

        const existing = await Post.findOne({ wp_id: post['wp:post_id'] });
        if (!existing) {
          // Save images to GridFS and get their IDs
          const imageIds = [];
          for (const url of imageUrls) {
            const imageId = await saveImageToGridFS(url);
            if (imageId) imageIds.push(imageId);
          }

          // Create the post
          await Post.create({
            wp_id: post['wp:post_id'],
            title: post.title || 'Untitled',
            content: content,
            date: new Date(post.pubDate),
            images: imageIds,
          });
          console.log(`Post with ID ${post['wp:post_id']} imported.`);
        } else {
          // Update existing post with GridFS images
          const imageIds = [];
          for (const url of imageUrls) {
            const imageId = await saveImageToGridFS(url);
            if (imageId) imageIds.push(imageId);
          }

          existing.images = imageIds; // Update the images field with GridFS IDs
          await existing.save();
          console.log(`Post with ID ${post['wp:post_id']} updated with GridFS images.`);
        }
      } catch (err) {
        console.error(`Error processing post with ID ${post['wp:post_id']}:`, err.message);
      }
    }

    console.log('Posts imported and updated successfully!');
  } catch (err) {
    console.error('Error importing posts:', err.message);
  } finally {
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

// Helper function to check if an image is less than 2 years old
function isImageRecent(url) {
  const match = url.match(/\/uploads\/(\d{4})\/(\d{2})\//);
  if (!match) return false;
  const [ , year, month ] = match;
  const imageDate = new Date(Number(year), Number(month) - 1);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  return imageDate >= twoYearsAgo;
}

importPosts();