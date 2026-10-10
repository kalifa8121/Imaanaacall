const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public')); // Frontend fayyadamuuf

// Neon PostgreSQL Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Admin VIP Contact Info
const ADMIN_CONTACT = {
  phone: "0920689815",
  telegram: "@kalifaakka"
};

// --- SOCKET.IO REAL-TIME CHAT & VIDEO CALL RINGING ---
let activeUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  socket.on('register_user', (userId) => {
    activeUsers.set(userId, socket.id);
    io.emit('online_users', Array.from(activeUsers.keys()));
  });

  // Ringing Video Call & Offline Missed Call Notification
  socket.on('call_user', ({ toUserId, callerInfo, signalData }) => {
    const receiverSocketId = activeUsers.get(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('incoming_call', {
        from: callerInfo,
        signal: signalData
      });
    } else {
      console.log(`User ${toUserId} is offline. Saving missed call.`);
      socket.emit('call_response', { status: 'offline_missed_call' });
    }
  });

  socket.on('answer_call', (data) => {
    io.to(data.to).emit('call_accepted', data.signal);
  });

  socket.on('disconnect', () => {
    for (let [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        break;
      }
    }
    io.emit('online_users', Array.from(activeUsers.keys()));
  });
});

// --- API ENDPOINTS ---

// 1. SignUp API (Customer / User)
app.post('/api/signup', async (req, res) => {
  const { name, email, password, phone, username } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, username, email, password, phone, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, username, role',
      [name, username || email.split('@')[0], email, hashedPassword, phone, 'user']
    );
    res.json({ success: true, message: "Galmee milkaa'inaa!", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Dogoggora galmee: " + err.message });
  }
});

// 2. Login API (Admin fi Customer Addaan Baasuun)
app.post('/api/login', async (req, res) => {
  const { username, password, email } = req.body;
  const loginKey = username || email;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $1', [loginKey]);
    if (userRes.rows.length === 0) return res.status(400).json({ success: false, error: "User hin argamne" });

    const user = userRes.rows[0];
    if (user.is_banned) return res.status(403).json({ success: false, error: `Akauntiin keessan adabameera.` });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ success: false, error: "Password dogoggoraa" });

    // Admin fi Customer Dashboard addaan baasuuf is_admin check godhuu
    const is_admin = (user.role === 'admin' || user.username === 'admin');

    const token = jwt.sign({ id: user.id, role: user.role, is_admin }, process.env.JWT_SECRET || 'secret_key');
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        is_admin,
        is_vip: user.is_vip
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Post Submission (Maammilli post yeroo godhu "Pending" ta'a, Admin qofaaf mul'ata)
app.post('/api/posts', async (req, res) => {
  const { userId, content, mediaUrl, mediaType } = req.body;
  try {
    await pool.query(
      'INSERT INTO posts (user_id, content, media_url, media_type, status) VALUES ($1, $2, $3, $4, $5)',
      [userId, content, mediaUrl, mediaType || 'none', 'pending']
    );
    res.json({ success: true, message: "Postiin keessan milkaa'inaan ergameera! Admin erga approve godhee booda public ni ta'a." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Fetch Approved Public Feed (Feed gadi lakkifame qofa agarsiisa)
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await pool.query("SELECT * FROM posts WHERE status = 'approved' ORDER BY created_at DESC");
    res.json(posts.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Admin Dashboard: Pending Posts Eegoo Ilaaluu fi Approve/Reject Gochuu
app.get('/api/admin/pending-posts', async (req, res) => {
  try {
    const pending = await pool.query("SELECT * FROM posts WHERE status = 'pending' ORDER BY created_at DESC");
    res.json(pending.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/moderate-post', async (req, res) => {
  const { postId, action } = req.body; // action: 'approve' ykn 'reject'
  try {
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query('UPDATE posts SET status = $1 WHERE id = $2', [newStatus, postId]);
    res.json({ success: true, message: `Postin milkaa'inaan ${newStatus} ta'eera!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Admin Moderation: User Ban / Suspend Gochuu (Guyyoota Muraasaaf)
app.post('/api/admin/moderate-user', async (req, res) => {
  const { userIdToBan, banDays } = req.body;
  try {
    await pool.query('UPDATE users SET is_banned = true, ban_days = $1 WHERE id = $2', [banDays, userIdToBan]);
    res.json({ success: true, message: `Maammilli guyyaa ${banDays}-f adabameera (suspended).` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. VIP Contact Info Endpoint
app.get('/api/vip-info', (req, res) => {
  res.json({
    message: "VIP Bitachuuf admin qunnamaa:",
    phone: ADMIN_CONTACT.phone,
    telegram: ADMIN_CONTACT.telegram
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
