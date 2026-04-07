// src/config/seed.js — Create the first administrator
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // Check if an admin already exists
  const [admins] = await conn.query("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1");
  if (admins.length) {
    console.log(`ℹ️  Admin déjà présent : ${admins[0].email}`);
    await conn.end();
    return;
  }

  // Read parameters from CLI args or env vars
  const rawEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  // Normalise the same way as express-validator normalizeEmail(): lowercase
  const email    = rawEmail ? rawEmail.toLowerCase().trim() : rawEmail;
  const username = process.argv[3] || process.env.ADMIN_USERNAME;
  const password = process.argv[4] || process.env.ADMIN_PASSWORD;

  if (!email || !username || !password) {
    console.error('Usage : node src/config/seed.js <email> <username> <password>');
    console.error('Ou via variables d\'environnement : ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ Mot de passe trop court (minimum 8 caractères)');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const [result] = await conn.query(
    "INSERT INTO users (email, username, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', 1)",
    [email, username, hash]
  );

  console.log(`✅ Administrateur créé`);
  console.log(`   ID       : ${result.insertId}`);
  console.log(`   Email    : ${email}`);
  console.log(`   Username : ${username}`);
  console.log(`   Rôle     : admin`);

  await conn.end();
}

seed().catch(err => {
  console.error('❌ Erreur seed:', err.message);
  if (err.code === 'ER_NO_SUCH_TABLE') {
    console.error('   → La table users n\'existe pas. Exécute d\'abord: npm run migrate');
  } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('   → Accès DB refusé. Vérifie DB_USER / DB_PASSWORD dans .env');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('   → MariaDB ne répond pas. Vérifie que le service est démarré.');
  }
  process.exit(1);
});
