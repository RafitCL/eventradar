import { pool } from './db.js';

const ready = (async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS artistas_favoritos (
        usuario_id INT NOT NULL,
        artista_nombre VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (usuario_id, artista_nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } finally {
    connection.release();
  }
})();

export async function getFavoriteArtists(userId) {
  await ready;
  const [rows] = await pool.execute(
    'SELECT artista_nombre FROM artistas_favoritos WHERE usuario_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows.map((row) => row.artista_nombre);
}

export async function addFavoriteArtist(userId, name) {
  await ready;
  const clean = String(name || '').trim();
  if (!clean) return;
  await pool.execute(
    'INSERT IGNORE INTO artistas_favoritos (usuario_id, artista_nombre) VALUES (?, ?)',
    [userId, clean]
  );
}

export async function removeFavoriteArtist(userId, name) {
  await ready;
  const clean = String(name || '').trim();
  if (!clean) return;
  await pool.execute(
    'DELETE FROM artistas_favoritos WHERE usuario_id = ? AND artista_nombre = ?',
    [userId, clean]
  );
}

export async function isFavoriteArtist(userId, name) {
  await ready;
  const clean = String(name || '').trim();
  const [rows] = await pool.execute(
    'SELECT 1 FROM artistas_favoritos WHERE usuario_id = ? AND artista_nombre = ? LIMIT 1',
    [userId, clean]
  );
  return rows.length > 0;
}