// src/config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             process.env.DB_PORT     || 3306,
  database:         process.env.DB_NAME     || 'cave_vigne',
  user:             process.env.DB_USER     || 'cave_user',
  password:         process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:  20,
  queueLimit:       0,
  charset:          'utf8mb4',
  timezone:         '+00:00',
});

pool.on('error', (err) => {
  console.error('[DB] Erreur pool:', err.code, err.message);
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log(`[DB] Connecté → ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'cave_vigne'}`);
    conn.release();
  })
  .catch(err => {
    console.error(`[DB] ❌ Connexion échouée: ${err.code} — ${err.message}`);
    console.error(`[DB]    Host: ${process.env.DB_HOST}, Port: ${process.env.DB_PORT}, DB: ${process.env.DB_NAME}, User: ${process.env.DB_USER}`);
  });

module.exports = pool;
