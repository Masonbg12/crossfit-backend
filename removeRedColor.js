const mongoose = require('mongoose');
require('dotenv').config();
const POST = require('./postModel');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

async function updateAllPosts() {
  const posts = await POST.find({});
  for (const post of posts) {
    const cleanedContent = post.content.replace(/color:\s*red/gi, 'color:#000');
    if (cleanedContent !== post.content) {
      post.content = cleanedContent;
      await post.save();
      console.log(`Updated post: ${post._id}`);
    }
  }
  console.log('All posts updated!');
  mongoose.disconnect();
}

updateAllPosts().catch(err => {
  console.error(err);
  mongoose.disconnect();
});