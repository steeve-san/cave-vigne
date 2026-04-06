// src/config/migrate.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn.query(`USE \`${process.env.DB_NAME}\`;`);

  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      username VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(500),
      role ENUM('user','admin') DEFAULT 'user',
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
  `;

  await conn.query(schema);
  console.log('✅ Migration terminée avec succès');
  await conn.end();
}

migrate().catch(err => { console.error('❌ Erreur migration:', err); process.exit(1); });
