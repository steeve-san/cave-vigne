// src/config/migrate.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const DB_NAME = process.env.DB_NAME || 'cave_vigne';
  console.log(`[migrate] Connexion à ${process.env.DB_HOST}:${process.env.DB_PORT || 3306} → base: ${DB_NAME}`);

  // Direct connection — the database must already exist (created by deploy.sh as root)
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
  });

  // Create tables (idempotent)
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      username VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(500),
      role ENUM('visiteur','user','admin') DEFAULT 'user',
      is_active BOOLEAN DEFAULT TRUE,
      email_verified BOOLEAN DEFAULT FALSE,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(500) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_token (token(255))
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS wines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      appellation VARCHAR(255),
      vintage YEAR,
      type ENUM('rouge','blanc','rosé','pétillant') NOT NULL,
      producer VARCHAR(255),
      region VARCHAR(255),
      grapes VARCHAR(500),
      country VARCHAR(100) DEFAULT 'France',
      quantity INT NOT NULL DEFAULT 1,
      position VARCHAR(20),
      price DECIMAL(10,2),
      keep_until YEAR,
      notes TEXT,
      label_image VARCHAR(500),
      bottle_photo VARCHAR(500),
      domain_website VARCHAR(500),
      domain_description TEXT,
      soil_type VARCHAR(200),
      altitude VARCHAR(100),
      is_drunk BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user (user_id),
      INDEX idx_type (type),
      INDEX idx_country (country),
      FULLTEXT idx_search (name, appellation, producer, region, grapes)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS wine_accords (
      id INT AUTO_INCREMENT PRIMARY KEY,
      wine_id INT NOT NULL,
      user_id INT NOT NULL,
      food VARCHAR(255) NOT NULL,
      stars TINYINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS spirits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      type ENUM('whisky','rhum','cognac','armagnac','calvados','gin','vodka','autre') NOT NULL,
      producer VARCHAR(255),
      origin VARCHAR(255),
      age VARCHAR(50),
      abv DECIMAL(4,1),
      status ENUM('stock','open','empty') DEFAULT 'stock',
      price DECIMAL(10,2),
      rating TINYINT CHECK (rating BETWEEN 0 AND 100),
      quantity INT DEFAULT 1,
      notes TEXT,
      label_image VARCHAR(500),
      bottle_photo VARCHAR(500),
      domain_website VARCHAR(500),
      domain_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user (user_id),
      INDEX idx_type (type)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS sommelier_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      query TEXT NOT NULL,
      result JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
      setting_value TEXT,
      setting_type ENUM('text','password','boolean','json') DEFAULT 'text',
      label VARCHAR(255),
      updated_by INT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(100) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_token (token)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS tasting_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      wine_id INT NOT NULL,
      user_id INT NOT NULL,
      tasted_at DATE NOT NULL,
      rating TINYINT CHECK (rating BETWEEN 1 AND 100),
      color_desc VARCHAR(255),
      nose VARCHAR(500),
      palate VARCHAR(500),
      finish VARCHAR(500),
      overall TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_wine (wine_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS wishlist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      producer VARCHAR(255),
      vintage YEAR,
      type ENUM('rouge','blanc','rosé','pétillant','autre') DEFAULT 'rouge',
      region VARCHAR(255),
      priority ENUM('low','medium','high') DEFAULT 'medium',
      price_max DECIMAL(10,2),
      url VARCHAR(500),
      notes TEXT,
      found BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS cave_value_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      total_value DECIMAL(10,2) DEFAULT 0,
      bottle_count INT DEFAULT 0,
      ref_count INT DEFAULT 0,
      recorded_at DATE NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_date (user_id, recorded_at),
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS shared_caves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner_id INT NOT NULL,
      guest_id INT,
      invite_email VARCHAR(255) NOT NULL,
      token VARCHAR(100) NOT NULL UNIQUE,
      permission ENUM('read','write') DEFAULT 'read',
      accepted BOOLEAN DEFAULT FALSE,
      accepted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (guest_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_owner (owner_id),
      INDEX idx_guest (guest_id),
      INDEX idx_token (token(50))
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS pending_wines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sharing_id INT NOT NULL,
      owner_id INT NOT NULL,
      guest_id INT NOT NULL,
      wine_data JSON NOT NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sharing_id) REFERENCES shared_caves(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (guest_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_owner (owner_id),
      INDEX idx_sharing (sharing_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS barcode_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ean VARCHAR(20) NOT NULL,
      name VARCHAR(255),
      producer VARCHAR(255),
      vintage SMALLINT,
      type VARCHAR(50),
      region VARCHAR(255),
      country VARCHAR(100),
      grapes TEXT,
      notes TEXT,
      label_url VARCHAR(500),
      source ENUM('off','vivino','oeni','livex','vandb','untappd','ratebeer','manual') DEFAULT 'off',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_ean (ean)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS beers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      brewery VARCHAR(255),
      type ENUM('blonde','brune','blanche','ambrée','IPA','NEIPA','stout','porter',
                'lager','pilsner','triple','quadruple','sour','saison','lambic','autre') NOT NULL DEFAULT 'blonde',
      country VARCHAR(100) DEFAULT 'France',
      region VARCHAR(255),
      abv DECIMAL(4,1),
      ibu SMALLINT,
      volume SMALLINT DEFAULT 33,
      quantity INT NOT NULL DEFAULT 1,
      price DECIMAL(10,2),
      rating TINYINT CHECK (rating BETWEEN 0 AND 100),
      status ENUM('stock','open','empty') DEFAULT 'stock',
      notes TEXT,
      label_image VARCHAR(500),
      ean VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user (user_id),
      INDEX idx_type (type)
    ) ENGINE=InnoDB;
  `;

  await conn.query(schema);

  // Update existing schema (idempotent)
  const alters = [
    // User roles
    `ALTER TABLE users MODIFY COLUMN role ENUM('visiteur','user','admin') DEFAULT 'user'`,
    // 2FA TOTP
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE`,
    // Domain & photos — wines
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS bottle_photo VARCHAR(500)`,
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS domain_website VARCHAR(500)`,
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS domain_description TEXT`,
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS soil_type VARCHAR(200)`,
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS altitude VARCHAR(100)`,
    // Enrichment fields — wines
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS food_pairings TEXT`,
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS certifications VARCHAR(500)`,
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS abv DECIMAL(4,1)`,
    `ALTER TABLE wines ADD COLUMN IF NOT EXISTS volume_ml SMALLINT DEFAULT 750`,
    // Domain & photos — spirits
    `ALTER TABLE spirits ADD COLUMN IF NOT EXISTS bottle_photo VARCHAR(500)`,
    `ALTER TABLE spirits ADD COLUMN IF NOT EXISTS domain_website VARCHAR(500)`,
    `ALTER TABLE spirits ADD COLUMN IF NOT EXISTS domain_description TEXT`,
    // Tasting photo
    `ALTER TABLE tasting_notes ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500)`,
  ];
  for (const sql of alters) {
    try { await conn.query(sql); } catch { /* already up to date */ }
  }

  // Default system settings
  const defaults = [
    ['smtp_host',    '',    'text',    'Serveur SMTP'],
    ['smtp_port',    '587', 'text',    'Port SMTP'],
    ['smtp_user',    '',    'text',    'Utilisateur SMTP'],
    ['smtp_pass',    '',    'password','Mot de passe SMTP'],
    ['smtp_from',    '',    'text',    'Adresse expéditeur'],
    ['smtp_secure',  '0',   'boolean', 'TLS/SSL'],
    ['anthropic_key','',    'password','Clé API Anthropic'],
    ['public_catalog','0',  'boolean', 'Catalogue public (sans auth)'],
    ['require_email_verify','0','boolean','Vérification email obligatoire'],
    // AI provider settings
    ['ai_provider',   'anthropic','text',   'Fournisseur IA (anthropic|openai|mistral|openwebui)'],
    ['anthropic_model','claude-sonnet-4-6','text','Modèle Anthropic'],
    ['openai_key',    '',   'password','Clé API OpenAI'],
    ['openai_model',  'gpt-4o-mini','text', 'Modèle OpenAI'],
    ['mistral_key',   '',   'password','Clé API Mistral'],
    ['mistral_model', 'mistral-small-latest','text','Modèle Mistral'],
    ['openwebui_url', 'http://localhost:11434','text','URL OpenWebUI / Ollama'],
    ['openwebui_key', '',   'text',    'API Key OpenWebUI (optionnel)'],
    ['openwebui_model','llama3','text', 'Modèle OpenWebUI / Ollama'],
  ];
  for (const [key, val, type, label] of defaults) {
    await conn.query(
      `INSERT IGNORE INTO system_settings (setting_key, setting_value, setting_type, label) VALUES (?,?,?,?)`,
      [key, val, type, label]
    );
  }

  console.log('✅ Migration terminée avec succès');
  await conn.end();
}

migrate().catch(err => {
  console.error('❌ Erreur migration:', err);
  process.exit(1);
});
