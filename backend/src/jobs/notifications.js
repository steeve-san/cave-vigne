// src/jobs/notifications.js — Daily cron: keep_until wine alerts + cleanup
const cron = require('node-cron');
const db = require('../config/db');
const { sendMail } = require('../config/email');

// Run every day at 08:00
function startNotifications() {
  cron.schedule('0 8 * * *', async () => {
    console.log('[notifications] Running keep_until check...');
    try {
      await sendKeepUntilAlerts();
      await cleanupExpiredTokens();
    } catch (err) {
      console.error('[notifications] Error:', err.message);
    }
  });

  // Snapshot cave value every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[notifications] Snapshotting cave values...');
    try { await snapshotCaveValues(); }
    catch (err) { console.error('[notifications] Snapshot error:', err.message); }
  });

  console.log('[notifications] Scheduled daily at 08:00 (alerts) and 00:00 (snapshot)');
}

async function sendKeepUntilAlerts() {
  // Find wines where keep_until is within the next 30 days and user has email
  const currentYear = new Date().getFullYear();
  const alertYear = currentYear + 1; // alert when 1 year away or past

  const [rows] = await db.query(`
    SELECT w.id, w.name, w.vintage, w.keep_until, w.appellation,
           u.email, u.username
    FROM wines w
    JOIN users u ON u.id = w.user_id
    WHERE w.is_drunk = 0
      AND w.quantity > 0
      AND w.keep_until IS NOT NULL
      AND w.keep_until <= ?
      AND u.is_active = 1
      AND u.email IS NOT NULL
    ORDER BY u.id, w.keep_until
  `, [alertYear]);

  if (!rows.length) return;

  // Group by user
  const byUser = {};
  for (const row of rows) {
    if (!byUser[row.email]) byUser[row.email] = { username: row.username, wines: [] };
    byUser[row.email].wines.push(row);
  }

  for (const [email, { username, wines }] of Object.entries(byUser)) {
    const wineList = wines.map(w =>
      `<li><strong>${w.name}</strong>${w.vintage ? ` (${w.vintage})` : ''}${w.appellation ? ` — ${w.appellation}` : ''} — à consommer avant ${w.keep_until}</li>`
    ).join('');

    try {
      await sendMail({
        to: email,
        subject: `Cave & Vigne — ${wines.length} vin${wines.length > 1 ? 's' : ''} à déguster`,
        html: `<p>Bonjour ${username},</p>
               <p>Les vins suivants approchent ou ont dépassé leur date optimale de dégustation :</p>
               <ul>${wineList}</ul>
               <p>Profitez-en avant qu'ils ne passent leur apogée !</p>
               <p><small>Cave & Vigne</small></p>`,
      });
      console.log(`[notifications] Alert sent to ${email} for ${wines.length} wine(s)`);
    } catch (err) {
      console.error(`[notifications] Failed to send to ${email}:`, err.message);
    }
  }
}

async function cleanupExpiredTokens() {
  await db.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  await db.query('DELETE FROM password_resets WHERE expires_at < NOW() OR used = 1');
}

async function snapshotCaveValues() {
  const today = new Date().toISOString().slice(0, 10);
  const [users] = await db.query(
    'SELECT DISTINCT user_id FROM wines WHERE is_drunk=0 AND quantity>0'
  );
  for (const { user_id } of users) {
    const [[{ value, bottles, refs }]] = await db.query(
      `SELECT SUM(COALESCE(price*quantity,0)) as value,
              SUM(quantity) as bottles,
              COUNT(*) as refs
       FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0`,
      [user_id]
    );
    await db.query(
      `INSERT INTO cave_value_history (user_id, total_value, bottle_count, ref_count, recorded_at)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         total_value=VALUES(total_value),
         bottle_count=VALUES(bottle_count),
         ref_count=VALUES(ref_count)`,
      [user_id, value || 0, bottles || 0, refs || 0, today]
    );
  }
  console.log(`[notifications] Snapshot done for ${users.length} user(s)`);
}

module.exports = { startNotifications, snapshotCaveValues };
