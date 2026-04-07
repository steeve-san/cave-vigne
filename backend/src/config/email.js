// src/config/email.js — Nodemailer avec config dynamique depuis system_settings
const nodemailer = require('nodemailer');
const db = require('./db');

async function getSmtpConfig() {
  const [rows] = await db.query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure')`
  );
  const cfg = {};
  rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
  return cfg;
}

async function createTransport() {
  const cfg = await getSmtpConfig();
  if (!cfg.smtp_host) throw new Error('SMTP non configuré — configurez-le dans Administration > Paramètres');
  return nodemailer.createTransport({
    host:   cfg.smtp_host,
    port:   parseInt(cfg.smtp_port) || 587,
    secure: cfg.smtp_secure === '1',
    auth:   cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_pass } : undefined,
  });
}

async function sendMail({ to, subject, html, text }) {
  const transport = await createTransport();
  const cfg = await getSmtpConfig();
  return transport.sendMail({
    from: cfg.smtp_from || cfg.smtp_user || 'Cave & Vigne <noreply@cave-vigne.local>',
    to, subject, html, text,
  });
}

async function testConnection() {
  const transport = await createTransport();
  await transport.verify();
}

module.exports = { sendMail, testConnection, getSmtpConfig };
