const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 }); // Max 100MB file uploads

const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_PASSKEY || 'admin123';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let strictModeration = true; // Post Admin approve gochuun qofa dabra

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users_table (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE,
        is_vip BOOLEAN DEFAULT FALSE,
        is_banned BOOLEAN DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50),
        content TEXT,
        media_url TEXT,
        media_type VARCHAR(20),
        likes INT DEFAULT 0,
        approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50),
        message TEXT,
        file_url TEXT,
        file_type VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized.");
  } catch (err) {
    console.error("DB Error:", err);
  }
}
initDB();

const activeUsers = {};

io.on('connection', (socket) => {

  socket.emit('update-user-list', Object.values(activeUsers));

  socket.on('register-user', async (username) => {
    try {
      let res = await pool.query('SELECT * FROM users_table WHERE username = $1', [username]);
      if (res.rows.length === 0) {
        res = await pool.query('INSERT INTO users_table (username) VALUES ($1) RETURNING *', [username]);
      }
      const user = res.rows[0];

      if (user.is_banned) {
        socket.emit('banned-notice');
        return;
      }

      activeUsers[socket.id] = { id: socket.id, username: user.username, is_vip: user.is_vip };
      io.emit('update-user-list', Object.values(activeUsers));
    } catch (e) { console.error(e); }
  });

  // Call Signaling (Voice & Video)
  socket.on('call-user', (data) => {
    io.to(data.userToCall).emit('incoming-call', {
      signal: data.signalData,
      from: socket.id,
      callerName: data.callerName,
      isVideo: data.isVideo
    });
  });

  socket.on('accept-call', (data) => io.to(data.to).emit('call-accepted', data.signal));
  socket.on('reject-call', (data) => io.to(data.to).emit('call-rejected'));

  // Chat & Media
  socket.on('send-message', async (data) => {
    await pool.query('INSERT INTO messages (username, message, file_url, file_type) VALUES ($1, $2, $3, $4)',
      [data.username, data.message || null, data.fileUrl || null, data.fileType || null]);
    io.emit('new-message', data);
  });

  // Posts system
  socket.on('create-post', async (data) => {
    const isApproved = !strictModeration;
    const res = await pool.query('INSERT INTO posts (username, content, media_url, media_type, approved) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [data.username, data.content, data.mediaUrl || null, data.mediaType || null, isApproved]);
    
    if (isApproved) {
      io.emit('new-post', res.rows[0]);
    } else {
      socket.emit('post-pending-notice');
    }
  });

  socket.on('like-post', async (postId) => {
    await pool.query('UPDATE posts SET likes = likes + 1 WHERE id = $1', [postId]);
    io.emit('update-likes', postId);
  });

  socket.on('disconnect', () => {
    delete activeUsers[socket.id];
    io.emit('update-user-list', Object.values(activeUsers));
  });
});

// Admin API
app.post('/api/admin/login', (req, res) => {
  if (req.body.passkey === ADMIN_KEY) res.json({ success: true, token: ADMIN_KEY });
  else res.status(401).json({ success: false, message: 'Invalid Admin Key' });
});

app.get('/api/admin/pending-posts', async (req, res) => {
  const data = await pool.query('SELECT * FROM posts WHERE approved = FALSE ORDER BY id DESC');
  res.json(data.rows);
});

app.post('/api/admin/approve-post', async (req, res) => {
  const { postId } = req.body;
  const data = await pool.query('UPDATE posts SET approved = TRUE WHERE id = $1 RETURNING *', [postId]);
  if (data.rows.length > 0) io.emit('new-post', data.rows[0]);
  res.json({ success: true });
});

app.post('/api/admin/delete-post', async (req, res) => {
  await pool.query('DELETE FROM posts WHERE id = $1', [req.body.postId]);
  res.json({ success: true });
});

app.get('/api/posts', async (req, res) => {
  const data = await pool.query('SELECT * FROM posts WHERE approved = TRUE ORDER BY id DESC LIMIT 50');
  res.json(data.rows);
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
