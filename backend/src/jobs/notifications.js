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
  console.log('[notifications] Scheduled daily at 08:00');
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

module.exports = { startNotifications };
