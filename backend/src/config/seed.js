// src/config/seed.js — Création du premier administrateur
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

  // Vérification : admin déjà existant ?
  const [admins] = await conn.query("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1");
  if (admins.length) {
    console.log(`ℹ️  Admin déjà présent : ${admins[0].email}`);
    await conn.end();
    return;
  }

  // Récupération des paramètres (args CLI ou env)
  const rawEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  // Normalisation identique à express-validator normalizeEmail() : lowercase
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
  process.exit(1);
});
