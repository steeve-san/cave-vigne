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

// CORS
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
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
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wines', require('./routes/wines'));
app.use('/api/spirits', require('./routes/spirits'));
app.use('/api/sommelier', require('./routes/sommelier'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() }));

// 404
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Route introuvable' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => console.log(`✅ API Cave & Vigne sur http://127.0.0.1:${PORT}`));
