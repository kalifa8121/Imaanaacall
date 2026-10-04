const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Middleware & Static Files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50),
        message TEXT,
        audio_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}
initDB();

// Active users tracking
const users = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register-user', (username) => {
    users[socket.id] = { id: socket.id, username };
    io.emit('update-user-list', Object.values(users));
  });

  // Handle Call Request
  socket.on('call-user', (data) => {
    io.to(data.userToCall).emit('incoming-call', {
      signal: data.signalData,
      from: socket.id,
      callerName: data.callerName,
      callType: data.callType // 'audio' or 'video'
    });
  });

  // Handle Accept Call
  socket.on('accept-call', (data) => {
    io.to(data.to).emit('call-accepted', data.signal);
  });

  // Handle Reject Call
  socket.on('reject-call', (data) => {
    io.to(data.to).emit('call-rejected');
  });

  // Handle End Call
  socket.on('end-call', (data) => {
    io.to(data.to).emit('call-ended');
  });

  // Chat Messages
  socket.on('send-message', async (data) => {
    try {
      await pool.query(
        'INSERT INTO messages (username, message, audio_url) VALUES ($1, $2, $3)',
        [data.username, data.message || null, data.audioUrl || null]
      );
      io.emit('new-message', data);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
    io.emit('update-user-list', Object.values(users));
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
