const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let onlineUsers = {};

io.on('connection', (socket) => {
  socket.on('register-user', async (username) => {
    onlineUsers[username] = socket.id;
    io.emit('update-user-list', Object.keys(onlineUsers));

    // Missed calls unread ta'an qorachuu
    try {
      const missedRes = await pool.query(
        'SELECT * FROM missed_calls WHERE receiver_username = $1 AND seen = FALSE ORDER BY created_at DESC',
        [username]
      );
      if (missedRes.rows.length > 0) {
        socket.emit('check-missed-calls', missedRes.rows);
        await pool.query('UPDATE missed_calls SET seen = TRUE WHERE receiver_username = $1', [username]);
      }
    } catch (err) {
      console.error("Missed Call Fetch Error:", err);
    }
  });

  socket.on('create-post', async (data) => {
    try {
      const res = await pool.query(
        'INSERT INTO posts (username, content, media_url, media_type, approved) VALUES ($1, $2, $3, $4, TRUE) RETURNING *',
        [data.username, data.content, data.mediaUrl || null, data.mediaType || null]
      );
      io.emit('new-post-created', res.rows[0]);
    } catch (err) {
      console.error("Post Error:", err);
    }
  });

  // Call Initiation & Missed Call Handling
  socket.on('call-user', async (data) => {
    const { callee, caller, type, signalData } = data;
    const targetSocketId = onlineUsers[callee];

    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', { caller, type, signalData });
    } else {
      try {
        await pool.query(
          'INSERT INTO missed_calls (caller_username, receiver_username, call_type) VALUES ($1, $2, $3)',
          [caller, callee, type]
        );
        socket.emit('call-offline-notice', { callee });
      } catch (err) {
        console.error("Save Missed Call Error:", err);
      }
    }
  });

  socket.on('disconnect', () => {
    for (let user in onlineUsers) {
      if (onlineUsers[user] === socket.id) {
        delete onlineUsers[user];
        break;
      }
    }
    io.emit('update-user-list', Object.keys(onlineUsers));
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) return res.status(400).json({ success: false, message: "User hin jiru!" });
    const user = userRes.rows[0];
    const validPass = await bcrypt.compare(password, user.password).catch(() => password === user.password);
    if (!validPass) return res.status(400).json({ success: false, message: "Password dogoggora!" });
    delete user.password;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
