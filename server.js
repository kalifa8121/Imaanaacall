const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 120 * 1024 * 1024
});

const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json({ limit: '120mb' }));
app.use(express.urlencoded({ extended: true, limit: '120mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();
const activeUsers = new Map();

const VIP_PHONE = process.env.VIP_PHONE || '0920689815';
const VIP_USERNAME = process.env.VIP_USERNAME || '@kalifa';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345';

const q = (sql, params = []) => pool.query(sql, params);

const makeToken = () =>
  crypto.randomBytes(32).toString('hex');

function safeUser(u) {
  if (!u) return null;

  const x = { ...u };
  delete x.password;

  return x;
}

function auth(req) {
  const h = req.headers.authorization || '';

  const token = h.startsWith('Bearer ')
    ? h.slice(7)
    : '';

  const username = sessions.get(token);

  return username || null;
}

async function requireUser(req, res, next) {
  const username = auth(req);

  if (!username) {
    return res.status(401).json({
      success: false,
      message: 'Login barbaachisa.'
    });
  }

  req.username = username;
  next();
}

async function requireAdmin(req, res, next) {
  try {
    const username = auth(req);

    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Admin login barbaachisa.'
      });
    }

    const r = await q(
      'SELECT is_admin FROM users WHERE username=$1',
      [username]
    );

    if (!r.rows[0]?.is_admin) {
      return res.status(403).json({
        success: false,
        message: 'Admin qofaaf.'
      });
    }

    req.username = username;
    next();
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      message: 'Admin authentication error.'
    });
  }
}


/* =========================================================
   DATABASE
========================================================= */

async function initDB() {

  await q(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone VARCHAR(30),
      bio TEXT,
      avatar TEXT,
      cover TEXT,
      full_name TEXT,
      gender TEXT,
      city TEXT,
      is_admin BOOLEAN DEFAULT FALSE,
      is_vip BOOLEAN DEFAULT FALSE,
      banned_until TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS posts(
      id SERIAL PRIMARY KEY,
      user_id INT,
      username VARCHAR(50),
      content TEXT,
      media_url TEXT,
      media_type VARCHAR(30),
      approved BOOLEAN DEFAULT FALSE,
      rejected BOOLEAN DEFAULT FALSE,
      likes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS comments(
      id SERIAL PRIMARY KEY,
      post_id INT,
      username VARCHAR(50),
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS post_likes(
      id SERIAL PRIMARY KEY,
      post_id INT,
      username VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, username)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS follows(
      id SERIAL PRIMARY KEY,
      follower VARCHAR(50),
      following VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower, following)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS friend_requests(
      id SERIAL PRIMARY KEY,
      sender VARCHAR(50),
      receiver VARCHAR(50),
      status VARCHAR(20) DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sender, receiver)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS messages(
      id SERIAL PRIMARY KEY,
      sender VARCHAR(50),
      receiver VARCHAR(50),
      message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS notifications(
      id SERIAL PRIMARY KEY,
      username VARCHAR(50),
      type VARCHAR(50),
      message TEXT,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS missed_calls(
      id SERIAL PRIMARY KEY,
      caller VARCHAR(50),
      receiver VARCHAR(50),
      call_type VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      seen BOOLEAN DEFAULT FALSE
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS saved_posts(
      id SERIAL PRIMARY KEY,
      post_id INT,
      username VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, username)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS moderation_actions(
      id SERIAL PRIMARY KEY,
      username VARCHAR(50),
      action VARCHAR(30),
      reason TEXT,
      admin_username VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);


  /* =========================================================
     SAFE MIGRATION
     Existing data hin haqamu.
  ========================================================= */

  const migrations = [

    ['users','cover','TEXT'],
    ['users','full_name','TEXT'],
    ['users','gender','TEXT'],
    ['users','city','TEXT'],
    ['users','is_admin','BOOLEAN DEFAULT FALSE'],
    ['users','is_vip','BOOLEAN DEFAULT FALSE'],
    ['users','banned_until','TIMESTAMP NULL'],

    ['posts','user_id','INT'],
    ['posts','username','VARCHAR(50)'],
    ['posts','content','TEXT'],
    ['posts','media_url','TEXT'],
    ['posts','media_type','VARCHAR(30)'],
    ['posts','approved','BOOLEAN DEFAULT FALSE'],
    ['posts','rejected','BOOLEAN DEFAULT FALSE'],
    ['posts','likes','INT DEFAULT 0'],
    ['posts','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],

    ['comments','post_id','INT'],
    ['comments','username','VARCHAR(50)'],
    ['comments','comment','TEXT'],
    ['comments','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],

    ['messages','sender','VARCHAR(50)'],
    ['messages','receiver','VARCHAR(50)'],
    ['messages','message','TEXT'],
    ['messages','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],

    ['notifications','username','VARCHAR(50)'],
    ['notifications','type','VARCHAR(50)'],
    ['notifications','message','TEXT'],
    ['notifications','read','BOOLEAN DEFAULT FALSE'],
    ['notifications','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],

    ['missed_calls','caller','VARCHAR(50)'],
    ['missed_calls','receiver','VARCHAR(50)'],
    ['missed_calls','call_type','VARCHAR(20)'],
    ['missed_calls','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
    ['missed_calls','seen','BOOLEAN DEFAULT FALSE'],

    ['moderation_actions','username','VARCHAR(50)'],
    ['moderation_actions','action','VARCHAR(30)'],
    ['moderation_actions','reason','TEXT'],
    ['moderation_actions','admin_username','VARCHAR(50)'],
    ['moderation_actions','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP']

  ];

  for (const [table, col, type] of migrations) {

    await q(`
      ALTER TABLE ${table}
      ADD COLUMN IF NOT EXISTS ${col} ${type}
    `);

  }


  /* =========================================================
     ADMIN USER
  ========================================================= */

  const existing = await q(
    'SELECT id FROM users WHERE username=$1',
    [ADMIN_USERNAME]
  );

  if (!existing.rows.length) {

    const hash = await bcrypt.hash(
      ADMIN_PASSWORD,
      12
    );

    await q(
      `
      INSERT INTO users(
        username,
        password,
        is_admin,
        full_name
      )
      VALUES($1,$2,TRUE,$3)
      `,
      [
        ADMIN_USERNAME,
        hash,
        'System Administrator'
      ]
    );
  }

  console.log('Neon database ready.');
}


/* =========================================================
   AUTH
========================================================= */

app.post('/api/auth/signup', async (req, res) => {

  try {

    const {
      username,
      password,
      phone,
      bio,
      full_name,
      gender,
      city
    } = req.body;

    if (!username || !password) {

      return res.status(400).json({
        success: false,
        message: 'Username fi password barbaachisa.'
      });

    }

    const hash = await bcrypt.hash(password, 12);

    const r = await q(
      `
      INSERT INTO users(
        username,
        password,
        phone,
        bio,
        full_name,
        gender,
        city
      )
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        username.trim(),
        hash,
        phone || '',
        bio || '',
        full_name || '',
        gender || '',
        city || ''
      ]
    );

    const token = makeToken();

    sessions.set(
      token,
      r.rows[0].username
    );

    res.json({
      success: true,
      token,
      user: safeUser(r.rows[0])
    });

  } catch (e) {

    console.error(e);

    res.status(400).json({
      success: false,
      message: 'Username kun dhihaate.'
    });

  }

});


app.post('/api/auth/login', async (req, res) => {

  try {

    const {
      username,
      password
    } = req.body;

    const r = await q(
      'SELECT * FROM users WHERE username=$1',
      [username]
    );

    if (!r.rows.length) {

      return res.status(400).json({
        success: false,
        message: 'Username hin jiru.'
      });

    }

    const u = r.rows[0];

    if (
      u.banned_until &&
      new Date(u.banned_until) > new Date()
    ) {

      return res.status(403).json({
        success: false,
        message: 'Account yeroo muraasaaf ban taʼeera.'
      });

    }

    if (!await bcrypt.compare(password, u.password)) {

      return res.status(400).json({
        success: false,
        message: 'Password dogoggora.'
      });

    }

    const token = makeToken();

    sessions.set(
      token,
      u.username
    );

    res.json({
      success: true,
      token,
      user: safeUser(u)
    });

  } catch (e) {

    console.error(e);

    res.status(500).json({
      success: false,
      message: 'Server error.'
    });

  }

});


app.post(
  '/api/auth/logout',
  requireUser,
  (req, res) => {

    const h =
      req.headers.authorization || '';

    sessions.delete(
      h.slice(7)
    );

    res.json({
      success: true
    });

  }
);


app.get(
  '/api/me',
  requireUser,
  async (req, res) => {

    const r = await q(
      'SELECT * FROM users WHERE username=$1',
      [req.username]
    );

    res.json(
      safeUser(r.rows[0])
    );

  }
);


/* =========================================================
   PROFILE
========================================================= */

app.post(
  '/api/profile/update',
  requireUser,
  async (req, res) => {

    const {
      phone,
      bio,
      avatar,
      cover,
      full_name,
      gender,
      city
    } = req.body;

    const r = await q(
      `
      UPDATE users
      SET
        phone=$1,
        bio=$2,
        avatar=$3,
        cover=$4,
        full_name=$5,
        gender=$6,
        city=$7
      WHERE username=$8
      RETURNING *
      `,
      [
        phone || '',
        bio || '',
        avatar || null,
        cover || null,
        full_name || '',
        gender || '',
        city || '',
        req.username
      ]
    );

    res.json({
      success: true,
      user: safeUser(r.rows[0])
    });

  }
);


app.get(
  '/api/users',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      SELECT
        id,
        username,
        phone,
        bio,
        avatar,
        is_admin,
        is_vip,
        full_name
      FROM users
      ORDER BY username
      `
    );

    const online = new Set(
      [...activeUsers.values()]
        .map(x => x.username)
    );

    res.json(
      r.rows.map(u => ({
        ...u,
        isOnline: online.has(u.username)
      }))
    );

  }
);


/* =========================================================
   POSTS
   User post godhu → admin qofaaf mul'ata.
   User immoo "posted" qofa arga.
========================================================= */

app.post(
  '/api/posts',
  requireUser,
  async (req, res) => {

    try {

      const {
        content,
        media_url,
        media_type
      } = req.body;

      const u = await q(
        `
        SELECT id, username
        FROM users
        WHERE username=$1
        `,
        [req.username]
      );

      const r = await q(
        `
        INSERT INTO posts(
          user_id,
          username,
          content,
          media_url,
          media_type,
          approved,
          rejected
        )
        VALUES(
          $1,$2,$3,$4,$5,FALSE,FALSE
        )
        RETURNING id
        `,
        [
          u.rows[0].id,
          req.username,
          content || '',
          media_url || null,
          media_type || null
        ]
      );

      res.json({
        success: true,
        postId: r.rows[0].id,
        message: 'posted'
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        success: false,
        message: 'Post save failed.'
      });

    }

  }
);


app.get(
  '/api/posts',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      SELECT
        p.*,

        COALESCE(
          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          ),
          0
        ) comment_count,

        EXISTS(
          SELECT 1
          FROM post_likes l
          WHERE
            l.post_id=p.id
            AND l.username=$1
        ) liked

      FROM posts p

      WHERE
        p.approved=TRUE
        AND p.rejected=FALSE

      ORDER BY p.id DESC

      LIMIT 100
      `,
      [req.username]
    );

    res.json(r.rows);

  }
);


/* =========================================================
   LIKE
========================================================= */

app.post(
  '/api/posts/:id/like',
  requireUser,
  async (req, res) => {

    const id =
      Number(req.params.id);

    const x = await q(
      `
      SELECT id
      FROM post_likes
      WHERE
        post_id=$1
        AND username=$2
      `,
      [
        id,
        req.username
      ]
    );

    if (x.rows.length) {

      await q(
        'DELETE FROM post_likes WHERE id=$1',
        [x.rows[0].id]
      );

      await q(
        `
        UPDATE posts
        SET likes=GREATEST(likes-1,0)
        WHERE id=$1
        `,
        [id]
      );

    } else {

      await q(
        `
        INSERT INTO post_likes(
          post_id,
          username
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
        `,
        [
          id,
          req.username
        ]
      );

      await q(
        `
        UPDATE posts
        SET likes=likes+1
        WHERE id=$1
        `,
        [id]
      );

    }

    res.json({
      success: true
    });

  }
);


/* =========================================================
   SAVE POST
========================================================= */

app.post(
  '/api/posts/:id/save',
  requireUser,
  async (req, res) => {

    await q(
      `
      INSERT INTO saved_posts(
        post_id,
        username
      )
      VALUES($1,$2)
      ON CONFLICT DO NOTHING
      `,
      [
        Number(req.params.id),
        req.username
      ]
    );

    res.json({
      success: true
    });

  }
);


/* =========================================================
   COMMENTS
========================================================= */

app.get(
  '/api/posts/:id/comments',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      SELECT *
      FROM comments
      WHERE post_id=$1
      ORDER BY id
      `,
      [
        Number(req.params.id)
      ]
    );

    res.json(r.rows);

  }
);


app.post(
  '/api/posts/:id/comments',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      INSERT INTO comments(
        post_id,
        username,
        comment
      )
      VALUES($1,$2,$3)
      RETURNING *
      `,
      [
        Number(req.params.id),
        req.username,
        req.body.comment || ''
      ]
    );

    io.emit(
      'new-comment',
      r.rows[0]
    );

    res.json(
      r.rows[0]
    );

  }
);


/* =========================================================
   DOWNLOAD APPROVED MEDIA
========================================================= */

app.get(
  '/api/posts/:id/download',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      SELECT
        media_url,
        media_type,
        id
      FROM posts

      WHERE
        id=$1
        AND approved=TRUE
        AND rejected=FALSE
      `,
      [
        Number(req.params.id)
      ]
    );

    if (
      !r.rows.length ||
      !r.rows[0].media_url
    ) {

      return res.status(404).send(
        'Media hin jiru.'
      );

    }

    const p = r.rows[0];

    const m =
      String(p.media_url);

    if (!m.startsWith('data:')) {

      return res.redirect(m);

    }

    const match =
      m.match(
        /^data:([^;]+);base64,(.*)$/
      );

    if (!match) {

      return res.status(400).send(
        'Media format hin beekamne.'
      );

    }

    const ext =
      (match[1].split('/')[1] || 'bin')
      .replace(/[^a-z0-9]/gi, '');

    res.setHeader(
      'Content-Type',
      match[1]
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="post-${p.id}.${ext}"`
    );

    res.send(
      Buffer.from(
        match[2],
        'base64'
      )
    );

  }
);


/* =========================================================
   FOLLOW
========================================================= */

app.post(
  '/api/follow',
  requireUser,
  async (req, res) => {

    await q(
      `
      INSERT INTO follows(
        follower,
        following
      )
      VALUES($1,$2)
      ON CONFLICT DO NOTHING
      `,
      [
        req.username,
        req.body.username
      ]
    );

    res.json({
      success: true
    });

  }
);


/* =========================================================
   FRIEND REQUEST
========================================================= */

app.post(
  '/api/friends/request',
  requireUser,
  async (req, res) => {

    await q(
      `
      INSERT INTO friend_requests(
        sender,
        receiver
      )
      VALUES($1,$2)
      ON CONFLICT DO NOTHING
      `,
      [
        req.username,
        req.body.username
      ]
    );

    await q(
      `
      INSERT INTO notifications(
        username,
        type,
        message
      )
      VALUES($1,$2,$3)
      `,
      [
        req.body.username,
        'friend',
        'Friend request qaba.'
      ]
    );

    res.json({
      success: true
    });

  }
);


app.post(
  '/api/friends/respond',
  requireUser,
  async (req, res) => {

    await q(
      `
      UPDATE friend_requests
      SET status=$1
      WHERE
        id=$2
        AND receiver=$3
      `,
      [
        req.body.status,
        Number(req.body.id),
        req.username
      ]
    );

    res.json({
      success: true
    });

  }
);


/* =========================================================
   CHAT
========================================================= */

app.get(
  '/api/chat/:username',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      SELECT *
      FROM messages

      WHERE
        (
          sender=$1
          AND receiver=$2
        )
        OR
        (
          sender=$2
          AND receiver=$1
        )

      ORDER BY id

      LIMIT 200
      `,
      [
        req.username,
        req.params.username
      ]
    );

    res.json(r.rows);

  }
);


app.post(
  '/api/chat',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      INSERT INTO messages(
        sender,
        receiver,
        message
      )
      VALUES($1,$2,$3)
      RETURNING *
      `,
      [
        req.username,
        req.body.receiver,
        req.body.message || ''
      ]
    );

    const target =
      [...activeUsers.entries()]
        .find(
          ([, u]) =>
            u.username ===
            req.body.receiver
        );

    if (target) {

      io.to(target[0]).emit(
        'new-message',
        r.rows[0]
      );

    }

    res.json(
      r.rows[0]
    );

  }
);


/* =========================================================
   NOTIFICATIONS
========================================================= */

app.get(
  '/api/notifications',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      SELECT *
      FROM notifications
      WHERE username=$1
      ORDER BY id DESC
      LIMIT 50
      `,
      [req.username]
    );

    res.json(r.rows);

  }
);


app.post(
  '/api/notifications/read',
  requireUser,
  async (req, res) => {

    await q(
      `
      UPDATE notifications
      SET read=TRUE
      WHERE username=$1
      `,
      [req.username]
    );

    res.json({
      success: true
    });

  }
);


/* =========================================================
   MISSED CALLS
========================================================= */

app.get(
  '/api/missed-calls',
  requireUser,
  async (req, res) => {

    const r = await q(
      `
      SELECT *
      FROM missed_calls
      WHERE receiver=$1
      ORDER BY id DESC
      LIMIT 50
      `,
      [req.username]
    );

    res.json(r.rows);

  }
);


/* =========================================================
   ADMIN MODERATION
========================================================= */

app.get(
  '/api/admin/pending-posts',
  requireAdmin,
  async (req, res) => {

    const r = await q(
      `
      SELECT *
      FROM posts
      WHERE
        approved=FALSE
        AND rejected=FALSE
      ORDER BY id ASC
      `
    );

    res.json(r.rows);

  }
);


app.post(
  '/api/admin/approve-post',
  requireAdmin,
  async (req, res) => {

    const id =
      Number(req.body.postId);

    const r = await q(
      `
      UPDATE posts
      SET
        approved=TRUE,
        rejected=FALSE
      WHERE id=$1
      RETURNING username
      `,
      [id]
    );

    if (r.rows[0]) {

      await q(
        `
        INSERT INTO notifications(
          username,
          type,
          message
        )
        VALUES($1,$2,$3)
        `,
        [
          r.rows[0].username,
          'post',
          'Post kee approved taʼeera.'
        ]
      );

    }

    res.json({
      success: true
    });

  }
);


app.post(
  '/api/admin/delete-post',
  requireAdmin,
  async (req, res) => {

    const id =
      Number(req.body.postId);

    await q(
      `
      UPDATE posts
      SET
        rejected=TRUE,
        approved=FALSE
      WHERE id=$1
      `,
      [id]
    );

    res.json({
      success: true
    });

  }
);


app.post(
  '/api/admin/ban-user',
  requireAdmin,
  async (req, res) => {

    const days =
      Math.max(
        1,
        Number(req.body.days) || 1
      );

    await q(
      `
      UPDATE users
      SET banned_until =
        NOW() +
        ($1 || ' days')::interval
      WHERE username=$2
      `,
      [
        days,
        req.body.username
      ]
    );

    await q(
      `
      INSERT INTO moderation_actions(
        username,
        action,
        reason,
        admin_username
      )
      VALUES($1,$2,$3,$4)
      `,
      [
        req.body.username,
        'BAN',
        req.body.reason || '',
        req.username
      ]
    );

    res.json({
      success: true
    });

  }
);


app.post(
  '/api/admin/warn-user',
  requireAdmin,
  async (req, res) => {

    await q(
      `
      INSERT INTO moderation_actions(
        username,
        action,
        reason,
        admin_username
      )
      VALUES($1,$2,$3,$4)
      `,
      [
        req.body.username,
        'WARN',
        req.body.reason || '',
        req.username
      ]
    );

    await q(
      `
      INSERT INTO notifications(
        username,
        type,
        message
      )
      VALUES($1,$2,$3)
      `,
      [
        req.body.username,
        'warning',
        'Admin irraa akeekkachiisa argatte.'
      ]
    );

    res.json({
      success: true
    });

  }
);


app.get(
  '/api/admin/users',
  requireAdmin,
  async (req, res) => {

    const r = await q(
      `
      SELECT
        id,
        username,
        phone,
        is_vip,
        banned_until,
        created_at
      FROM users
      ORDER BY id DESC
      `
    );

    res.json(r.rows);

  }
);


app.get(
  '/api/admin/vip',
  requireAdmin,
  async (req, res) => {

    res.json({
      phone: VIP_PHONE,
      username: VIP_USERNAME
    });

  }
);


/* =========================================================
   SOCKET.IO + WEBRTC
   Voice call + Video call
   Offline call -> missed call
========================================================= */

io.on(
  'connection',
  (socket) => {

    socket.on(
      'register-user',
      async (username) => {

        activeUsers.set(
          socket.id,
          { username }
        );

        io.emit(
          'update-user-list'
        );

      }
    );


    socket.on(
      'call-user',
      async (data) => {

        const target =
          [...activeUsers.entries()]
            .find(
              ([, u]) =>
                u.username ===
                data.userToCall
            );

        if (target) {

          io.to(target[0]).emit(
            'incoming-call',
            {
              signal: data.signalData,
              from: socket.id,
              callerName: data.callerName,
              isVideo: !!data.isVideo
            }
          );

        } else {

          await q(
            `
            INSERT INTO missed_calls(
              caller,
              receiver,
              call_type
            )
            VALUES($1,$2,$3)
            `,
            [
              data.callerName,
              data.userToCall,
              data.isVideo
                ? 'video'
                : 'voice'
            ]
          );

          await q(
            `
            INSERT INTO notifications(
              username,
              type,
              message
            )
            VALUES($1,$2,$3)
            `,
            [
              data.userToCall,
              'missed_call',
              `Missed ${data.isVideo ? 'video' : 'voice'} call @${data.callerName}`
            ]
          );

          socket.emit(
            'call-failed-offline'
          );

        }

      }
    );


    socket.on(
      'accept-call',
      (data) => {

        io.to(data.to).emit(
          'call-accepted',
          data.signal
        );

      }
    );


    socket.on(
      'reject-call',
      (data) => {

        io.to(data.to).emit(
          'call-rejected'
        );

      }
    );


    socket.on(
      'disconnect',
      () => {

        activeUsers.delete(
          socket.id
        );

        io.emit(
          'update-user-list'
        );

      }
    );

  }
);


/* =========================================================
   FRONTEND
   Express 5 wildcard rakkoo irraa of eega.
========================================================= */

app.get(
  /^(?!\/api).*/,
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        'public',
        'index.html'
      )
    );

  }
);


/* =========================================================
   START SERVER
========================================================= */

async function start() {

  try {

    await initDB();

    server.listen(
      PORT,
      () => {
        console.log(
          `Imaanaa Social running on ${PORT}`
        );
      }
    );

  } catch (e) {

    console.error(
      'DB INIT ERROR:',
      e
    );

    process.exit(1);

  }

}

start();
