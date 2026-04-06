// src/config/redis.js
const { createClient } = require('redis');

let client = null;

async function getRedis() {
  if (client && client.isOpen) return client;
  client = createClient({
    socket: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
    password: process.env.REDIS_PASSWORD || undefined,
  });
  client.on('error', (err) => console.warn('Redis error (non-fatal):', err.message));
  try {
    await client.connect();
    console.log('✅ Redis connecté');
  } catch (e) {
    console.warn('⚠️ Redis non disponible, cache désactivé');
    client = null;
  }
  return client;
}

async function cacheGet(key) {
  try { const r = await getRedis(); if (!r) return null; const v = await r.get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function cacheSet(key, value, ttlSeconds = 300) {
  try { const r = await getRedis(); if (!r) return; await r.setEx(key, ttlSeconds, JSON.stringify(value)); } catch {}
}
async function cacheDel(pattern) {
  try { const r = await getRedis(); if (!r) return; const keys = await r.keys(pattern); if (keys.length) await r.del(keys); } catch {}
}

module.exports = { cacheGet, cacheSet, cacheDel };
