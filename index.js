require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'DriveKind API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/users', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.status(200).json({
      message: 'Get all users',
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error retrieving users' });
  }
});

app.listen(PORT, () => {
  console.log(`DriveKind API server running on port ${PORT}`);
});

module.exports = app;