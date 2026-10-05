const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_PASSKEY || 'admin123';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        phone VARCHAR(20),
        bio TEXT,
        avatar TEXT,
        is_vip BOOLEAN DEFAULT FALSE,
        banned_until TIMESTAMP DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        sender VARCHAR(50),
        receiver VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending'
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

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INT,
        username VARCHAR(50),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS missed_calls (
        id SERIAL PRIMARY KEY,
        caller VARCHAR(50),
        receiver VARCHAR(50),
        call_type VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("DB Initialization Error:", err);
  }
}
initDB();

const activeUsers = {}; // socket.id -> { username, id }

io.on('connection', (socket) => {

  socket.on('register-user', async (username) => {
    try {
      const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (userRes.rows.length > 0 && userRes.rows[0].banned_until && new Date(userRes.rows[0].banned_until) > new Date()) {
        socket.emit('banned-notice', `Account keessan hanga ${userRes.rows[0].banned_until} patti ban godhameera.`);
        return;
      }

      activeUsers[socket.id] = { id: socket.id, username };
      
      // Check Missed Calls
      const missed = await pool.query('SELECT * FROM missed_calls WHERE receiver = $1', [username]);
      if (missed.rows.length > 0) {
        socket.emit('missed-calls-notice', missed.rows);
        await pool.query('DELETE FROM missed_calls WHERE receiver = $1', [username]);
      }

      broadcastUserList();
    } catch (e) { console.error(e); }
  });

  async function broadcastUserList() {
    const allUsersRes = await pool.query('SELECT username, avatar, is_vip FROM users');
    const onlineUsernames = Object.values(activeUsers).map(u => u.username);
    
    const userList = allUsersRes.rows.map(u => ({
      username: u.username,
      avatar: u.avatar,
      is_vip: u.is_vip,
      isOnline: onlineUsernames.includes(u.username),
      socketId: Object.keys(activeUsers).find(key => activeUsers[key].username === u.username)
    }));

    io.emit('update-user-list', userList);
  }

  // Call Signaling
  socket.on('call-user', async (data) => {
    const targetSocket = Object.keys(activeUsers).find(key => activeUsers[key].username === data.userToCall);
    if (targetSocket) {
      io.to(targetSocket).emit('incoming-call', {
        signal: data.signalData,
        from: socket.id,
        callerName: data.callerName,
        isVideo: data.isVideo
      });
    } else {
      // Receiver is Offline
      await pool.query('INSERT INTO missed_calls (caller, receiver, call_type) VALUES ($1, $2, $3)',
        [data.callerName, data.userToCall, data.isVideo ? 'video' : 'voice']);
      socket.emit('call-failed-offline');
    }
  });

  socket.on('accept-call', (data) => io.to(data.to).emit('call-accepted', data.signal));
  socket.on('reject-call', (data) => io.to(data.to).emit('call-rejected'));

  // Post creation
  socket.on('create-post', async (data) => {
    try {
      const res = await pool.query(
        'INSERT INTO posts (username, content, media_url, media_type, approved) VALUES ($1, $2, $3, $4, FALSE) RETURNING *',
        [data.username, data.content, data.mediaUrl || null, data.mediaType || null]
      );
      socket.emit('post-submitted-silent', res.rows[0]);
    } catch (e) { console.error(e); }
  });

  socket.on('like-post', async (postId) => {
    await pool.query('UPDATE posts SET likes = likes + 1 WHERE id = $1', [postId]);
    io.emit('update-likes', postId);
  });

  socket.on('add-comment', async (data) => {
    const res = await pool.query('INSERT INTO comments (post_id, username, comment) VALUES ($1, $2, $3) RETURNING *',
      [data.postId, data.username, data.comment]);
    io.emit('new-comment', res.rows[0]);
  });

  socket.on('disconnect', () => {
    delete activeUsers[socket.id];
    broadcastUserList();
  });
});

// REST APIs
app.post('/api/profile/save', async (req, res) => {
  const { username, phone, bio, avatar } = req.body;
  await pool.query(`
    INSERT INTO users (username, phone, bio, avatar) 
    VALUES ($1, $2, $3, $4) 
    ON CONFLICT (username) 
    DO UPDATE SET phone = $2, bio = $3, avatar = $4`,
    [username, phone, bio, avatar]);
  res.json({ success: true });
});

app.get('/api/posts', async (req, res) => {
  const posts = await pool.query('SELECT * FROM posts WHERE approved = TRUE ORDER BY id DESC LIMIT 50');
  res.json(posts.rows);
});

app.get('/api/comments/:postId', async (req, res) => {
  const comments = await pool.query('SELECT * FROM comments WHERE post_id = $1 ORDER BY id ASC', [req.params.postId]);
  res.json(comments.rows);
});

// Admin API
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

app.post('/api/admin/ban-user', async (req, res) => {
  const { username, days } = req.body;
  const banDate = new Date();
  banDate.setDate(banDate.getDate() + parseInt(days));
  await pool.query('UPDATE users SET banned_until = $1 WHERE username = $2', [banDate, username]);
  res.json({ success: true });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
