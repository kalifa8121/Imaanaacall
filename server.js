const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Neon PostgreSQL Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Database Tables Setup
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        is_paid BOOLEAN DEFAULT FALSE,
        balance NUMERIC DEFAULT 0.00
    );
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender VARCHAR(50),
        text TEXT,
        audio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`).catch(err => console.error("Database initialization error:", err));

const activeUsers = {};

// Express Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Admin Route: Galii fi Too'annoo (Monetization Control)
app.get('/api/admin/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/toggle-paid', async (req, res) => {
    const { username, is_paid } = req.body;
    try {
        await pool.query('UPDATE users SET is_paid = $1 WHERE username = $2', [is_paid, username]);
        res.json({ success: true, message: `Status update gochuu milkaa'eera.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Realtime Communications Logic
io.on('connection', (socket) => {
    socket.on('join', async (username) => {
        activeUsers[socket.id] = { id: socket.id, username };
        
        // Save or update user in Neon DB
        await pool.query(
            'INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO NOTHING',
            [username]
        );

        io.emit('user-list', Object.values(activeUsers));
        
        // Message History Fetch
        const history = await pool.query('SELECT * FROM messages ORDER BY id DESC LIMIT 50');
        socket.emit('message-history', history.rows.reverse());
    });

    socket.on('send-message', async (data) => {
        const sender = activeUsers[socket.id]?.username || 'Anonymous';
        
        // Save to Neon Database
        await pool.query(
            'INSERT INTO messages (sender, text, audio) VALUES ($1, $2, $3)',
            [sender, data.text || null, data.audio || null]
        );

        io.emit('chat-message', {
            sender,
            text: data.text,
            audio: data.audio,
            created_at: new Date()
        });
    });

    // WebRTC Calling Signals
    socket.on('call-user', (data) => {
        socket.to(data.to).emit('incoming-call', {
            from: socket.id,
            callerName: activeUsers[socket.id]?.username,
            offer: data.offer,
            isVideo: data.isVideo
        });
    });

    socket.on('answer-call', (data) => {
        socket.to(data.to).emit('call-answered', { answer: data.answer });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.to).emit('ice-candidate', { candidate: data.candidate });
    });

    socket.on('end-call', (data) => {
        socket.to(data.to).emit('call-ended');
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        io.emit('user-list', Object.values(activeUsers));
    });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
