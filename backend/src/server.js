// src/server.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.set('trust proxy', 1);

// CORS — allow all in dev, restrict to ALLOWED_ORIGINS in production
const isDev = process.env.NODE_ENV !== 'production';
const corsOrigins = isDev
  ? true
  : (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Trop de tentatives, réessayez dans 15 minutes' } });
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'), {
  maxAge: '7d', etag: true, lastModified: true,
}));

// Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/wines',    require('./routes/wines'));
app.use('/api/spirits',  require('./routes/spirits'));
app.use('/api/sommelier',require('./routes/sommelier'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/tasting',  require('./routes/tasting'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/sharing',  require('./routes/sharing'));
app.use('/api/beers',    require('./routes/beers'));

// Scheduled jobs
require('./jobs/notifications').startNotifications();

// Health check — public, teste vraiment la DB
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'ok';
  try {
    const db = require('./config/db');
    await db.query('SELECT 1');
  } catch (err) {
    dbStatus = `error: ${err.code || err.message}`;
  }
  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    version: process.env.npm_package_version || '1.1.0',
    env:     process.env.NODE_ENV || 'development',
    ts:      new Date().toISOString(),
    db:      dbStatus,
  });
});

// Debug — accessible avec ?token=DEBUG_TOKEN (env var) ou en dev sans token
app.get('/api/debug', async (req, res) => {
  const debugToken = process.env.DEBUG_TOKEN;
  if (!isDev && (!debugToken || req.query.token !== debugToken))
    return res.status(403).json({ error: 'Token requis: ?token=DEBUG_TOKEN' });

  let dbStatus = 'ok'; let tables = [];
  try {
    const db = require('./config/db');
    await db.query('SELECT 1');
    const [rows] = await db.query('SHOW TABLES');
    tables = rows.map(r => Object.values(r)[0]);
  } catch (err) {
    dbStatus = `${err.code}: ${err.message}`;
  }
  res.json({
    env: {
      NODE_ENV:          process.env.NODE_ENV,
      PORT:              process.env.PORT,
      DB_HOST:           process.env.DB_HOST,
      DB_PORT:           process.env.DB_PORT,
      DB_NAME:           process.env.DB_NAME,
      DB_USER:           process.env.DB_USER,
      DB_PASSWORD:       process.env.DB_PASSWORD ? '***set***' : '(empty)',
      JWT_SECRET:        process.env.JWT_SECRET  ? '***set***' : '(empty)',
      ALLOWED_ORIGINS:   process.env.ALLOWED_ORIGINS,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***set***' : '(empty)',
    },
    db: { status: dbStatus, tables },
  });
});

// 404
app.use('/api/*', (_req, res) => res.status(404).json({ error: 'Route introuvable' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: isDev ? err.message : 'Erreur interne' });
});

const PORT = process.env.PORT || 3001;
const HOST = isDev ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`✅ API Cave & Vigne sur http://${HOST}:${PORT}`));
