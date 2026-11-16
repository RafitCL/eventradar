import { pool } from './db.js';

export async function getCategories() {
  const [rows] = await pool.execute('SELECT id, nombre FROM categorias ORDER BY nombre ASC');
  return rows;
}

export async function getUserTastes(userId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.nombre
     FROM gustos_usuario gu
     JOIN categorias c ON c.id = gu.categoria_id
     WHERE gu.usuario_id = ?
     ORDER BY c.nombre ASC`,
    [userId]
  );
  return rows;
}

export async function setUserTastes(userId, categoryNames = []) {
  const cleanNames = [...new Set(
    (Array.isArray(categoryNames) ? categoryNames : [])
      .map((name) => String(name || '').trim())
      .filter(Boolean)
  )];

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute('DELETE FROM gustos_usuario WHERE usuario_id = ?', [userId]);

      for (const name of cleanNames) {
        await connection.execute('INSERT IGNORE INTO categorias (nombre) VALUES (?)', [name]);
        const [rows] = await connection.execute('SELECT id FROM categorias WHERE nombre = ?', [name]);
        if (rows.length > 0) {
          await connection.execute(
            'INSERT IGNORE INTO gustos_usuario (usuario_id, categoria_id) VALUES (?, ?)',
            [userId, rows[0].id]
          );
        }
      }

      await connection.commit();
      connection.release();
      return getUserTastes(userId);
    } catch (error) {
      await connection.rollback();
      connection.release();
      const isDeadlock = error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213;
      if (isDeadlock && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

export async function saveEvent(event) {
  if (!event?.id) return null;

  await pool.execute(
    `INSERT INTO eventos
      (ticketmaster_id, nombre, fecha, ciudad, venue, url, genero_principal, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nombre = VALUES(nombre),
       fecha = VALUES(fecha),
       ciudad = VALUES(ciudad),
       venue = VALUES(venue),
       url = VALUES(url),
       genero_principal = VALUES(genero_principal),
       raw_json = VALUES(raw_json)`,
    [
      String(event.id),
      String(event.name || 'Evento sin nombre'),
      event.date || null,
      event.city || null,
      event.venue || null,
      event.url || null,
      Array.isArray(event.genres) && event.genres.length > 0 ? event.genres[0] : null,
      JSON.stringify(event)
    ]
  );

  const [rows] = await pool.execute(
    'SELECT id FROM eventos WHERE ticketmaster_id = ?',
    [String(event.id)]
  );
  if (rows.length === 0) return null;

  const eventId = rows[0].id;
  const genres = [
    ...(Array.isArray(event.genres) ? event.genres : []),
    ...(Array.isArray(event.subgenres) ? event.subgenres : [])
  ];

  for (const genre of genres) {
    const name = String(genre || '').trim();
    if (!name || name === 'Undefined') continue;

    await pool.execute('INSERT IGNORE INTO categorias (nombre) VALUES (?)', [name]);
    const [categoryRows] = await pool.execute('SELECT id FROM categorias WHERE nombre = ?', [name]);
    if (categoryRows.length > 0) {
      await pool.execute(
        'INSERT IGNORE INTO evento_categorias (evento_id, categoria_id) VALUES (?, ?)',
        [eventId, categoryRows[0].id]
      );
    }
  }

  return eventId;
}

export async function saveEvents(events = []) {
  const saved = [];
  for (const event of Array.isArray(events) ? events : []) {
    try {
      const id = await saveEvent(event);
      if (id) saved.push(id);
    } catch (error) {
      console.error('No se pudo guardar el evento:', event?.id, error?.message || error);
    }
  }
  return saved;
}
