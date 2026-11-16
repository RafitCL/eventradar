import crypto from 'crypto';
import { pool } from './db.js';

const ready = (async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        email VARCHAR(255) NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } finally {
    connection.release();
  }
})();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || null,
    createdAt: row.created_at
  };
}

export async function createUser({ username, password, email = null }) {
  await ready;
  const cleanUsername = String(username || '').trim();
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;

  const [existingByUsername] = await pool.execute(
    'SELECT id FROM users WHERE username = ?',
    [cleanUsername]
  );
  if (existingByUsername.length > 0) {
    const error = new Error('El nombre de usuario ya está en uso.');
    error.code = 'USERNAME_TAKEN';
    throw error;
  }

  if (cleanEmail) {
    const [existingByEmail] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [cleanEmail]
    );
    if (existingByEmail.length > 0) {
      const error = new Error('El correo electrónico ya está registrado.');
      error.code = 'EMAIL_TAKEN';
      throw error;
    }
  }

  const passwordHash = hashPassword(password);
  const [result] = await pool.execute(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [cleanUsername, cleanEmail, passwordHash]
  );

  const [rows] = await pool.execute(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE id = ?',
    [result.insertId]
  );
  return toPublicUser(rows[0]);
}

export async function authenticateUser(username, password) {
  await ready;
  const [rows] = await pool.execute(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE username = ?',
    [String(username || '').trim()]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!verifyPassword(password, row.password_hash)) return null;
  return toPublicUser(row);
}

export async function getUserById(id) {
  await ready;
  const [rows] = await pool.execute(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE id = ?',
    [id]
  );
  return toPublicUser(rows[0]);
}

export async function getOrCreateUserByUsername(username) {
  await ready;
  const cleanUsername = String(username || '').trim().slice(0, 32);
  if (!cleanUsername) return null;

  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE username = ?',
    [cleanUsername]
  );
  if (existing.length > 0) return existing[0].id;

  const passwordHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  const [result] = await pool.execute(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [cleanUsername, null, passwordHash]
  );
  return result.insertId;
}

export async function countUsers() {
  await ready;
  const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM users');
  return rows[0].total;
}
