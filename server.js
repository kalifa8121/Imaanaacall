const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let onlineUsers = {};

// --- SOCKET.IO EVENTS ---
io.on('connection', (socket) => {
  socket.on('register-user', async (username) => {
    onlineUsers[username] = socket.id;
    io.emit('update-user-list', Object.keys(onlineUsers));

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

// --- AUTHENTICATION ROUTES ---

// 1. SIGNUP API
app.post('/api/auth/signup', async (req, res) => {
  const { username, password, phone } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username fi Password guutuu qabdu!" });
  }

  try {
    const checkUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (checkUser.rows.length > 0) {
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
    res.status(500).json({ success: false, message: "Server Error: " + err.message });
  }
});

// 2. LOGIN API
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username fi Password guutuu qabdu!" });
  }

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Username kun hin jiru!" });
    }

    const user = userRes.rows[0];

    let validPass = false;
    try {
      validPass = await bcrypt.compare(password, user.password);
    } catch (e) {
      validPass = (password === user.password);
    }

    if (!validPass) {
      return res.status(400).json({ success: false, message: "Password dogoggora!" });
    }

    delete user.password;
    res.json({ success: true, user });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server Error: " + err.message });
  }
});

// 3. GET ALL USERS API
app.get('/api/users', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, username, phone, bio FROM users');
    res.json(users.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
