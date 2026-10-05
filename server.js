const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  } catch (err) {
    console.error("DB Error:", err);
  }
}
initDB();

const users = {};

io.on('connection', (socket) => {
  socket.on('register-user', (username) => {
    users[socket.id] = { id: socket.id, username };
    io.emit('update-user-list', Object.values(users));
  });

  socket.on('call-user', (data) => {
    io.to(data.userToCall).emit('incoming-call', {
      signal: data.signalData,
      from: socket.id,
      callerName: data.callerName
    });
  });

  socket.on('accept-call', (data) => {
    io.to(data.to).emit('call-accepted', data.signal);
  });

  socket.on('reject-call', (data) => {
    io.to(data.to).emit('call-rejected');
  });

  socket.on('send-message', async (data) => {
    try {
      await pool.query(
        'INSERT INTO messages (username, message, audio_url) VALUES ($1, $2, $3)',
        [data.username, data.message || null, data.audioUrl || null]
      );
      io.emit('new-message', data);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
    io.emit('update-user-list', Object.values(users));
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
