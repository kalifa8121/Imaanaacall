const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Online Users Map: { username: socketId }
const onlineUsers = new Map();

// ------------------- API ROUTES (UNTOUCHED) -------------------

// 1. SIGNUP API
app.post('/api/auth/signup', async (req, res) => {
  const { username, password, phone } = req.body;
  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: "Username'n kun dhihaateera!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (username, password, phone) VALUES ($1, $2, $3) RETURNING id, username, phone',
      [username, hashedPassword, phone || null]
    );

    res.json({ success: true, user: newUser.rows[0] });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: "Server Error!" });
  }
});

// 2. LOGIN API
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Maqaan akkasii hin jiru!" });
    }

    const user = userRes.rows[0];

    let validPass = false;
    try {
      validPass = await bcrypt.compare(password, user.password);
    } catch(e) {
      validPass = (password === user.password);
    }

    if (!validPass) {
      return res.status(400).json({ success: false, message: "Password dogoggora!" });
    }

    delete user.password;
    res.json({ success: true, user });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server Error!" });
  }
});

// ------------------- SOCKET.IO LOGIC -------------------

io.on('connection', (socket) => {

  // User online yeroo ta'u (Missed call check gochuu)
  socket.on('user-connected', async (username) => {
    socket.username = username;
    onlineUsers.set(username, socket.id);
    io.emit('update-user-list', Array.from(onlineUsers.keys()));

    try {
      const missedRes = await pool.query(
        'SELECT * FROM missed_calls WHERE receiver_username = $1 ORDER BY created_at DESC',
        [username]
      );
      if (missedRes.rows.length > 0) {
        socket.emit('missed-calls-notification', missedRes.rows);
        await pool.query('DELETE FROM missed_calls WHERE receiver_username = $1', [username]);
      }
    } catch (err) {
      console.error("Missed Call Fetch Error:", err);
    }
  });

  // Call Initiated (Voice/Video offline support)
  socket.on('start-call', async (data) => {
    const { toUsername, type } = data;
    const targetSocketId = onlineUsers.get(toUsername);

    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', {
        from: socket.username,
        type
      });
    } else {
      // User-n Offline jira -> Missed call galmeessi
      try {
        await pool.query(
          'INSERT INTO missed_calls (caller_username, receiver_username, call_type) VALUES ($1, $2, $3)',
          [socket.username, toUsername, type]
        );
        socket.emit('call-status', { 
          message: `@${toUsername} offline jira. Missed Call akka arguuf galmeeffameera!` 
        });
      } catch (err) {
        console.error("Save Missed Call Error:", err);
      }
    }
  });

  // Post creation
  socket.on('create-post', async (data) => {
    try {
      const res = await pool.query(
        'INSERT INTO posts (username, content, media_url, media_type, approved) VALUES ($1, $2, $3, $4, TRUE) RETURNING *',
        [data.username, data.content, data.mediaUrl || null, data.mediaType || null]
      );
      io.emit('new-post-created', res.rows[0]);
    } catch (err) {
      console.error("Post Creation Error:", err);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('update-user-list', Array.from(onlineUsers.keys()));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
