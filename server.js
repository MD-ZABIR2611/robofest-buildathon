require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const app = express();

// --- MIDDLEWARE ---
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- DATABASE CONNECTION ---
// Removed the unsupported options for the new Mongoose version
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// --- SERVE WEBSITE FILES ---
app.use(express.static(path.join(__dirname, 'public')));

// --- START THE SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 MediCare+ Server running on http://localhost:${PORT}`);
});