import express from 'express';
import {
  getFavoriteArtists,
  addFavoriteArtist,
  removeFavoriteArtist,
  isFavoriteArtist
} from '../services/artistFavorites.js';
import { getOrCreateUserByUsername } from '../services/users.js';

const router = express.Router();

async function resolveUserId(req) {
  if (req.session?.user?.id) return req.session.user.id;
  const lastfmUsername = req.session?.lastfm?.username;
  if (lastfmUsername) {
    const id = await getOrCreateUserByUsername(lastfmUsername);
    if (id) {
      if (!req.session.user) req.session.user = { id, username: lastfmUsername };
      else req.session.user.id = id;
    }
    return id;
  }
  return null;
}

router.get('/', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Debes iniciar sesión.' } });
  }
  try {
    const favorites = await getFavoriteArtists(userId);
    res.json({ favorites });
  } catch (error) {
    console.error('Artist favorites error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No se pudieron cargar los artistas favoritos.' } });
  }
});

router.get('/check', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ favorite: false });
  }
  const name = String(req.query.name || '').trim();
  if (!name) return res.json({ favorite: false });
  try {
    const favorite = await isFavoriteArtist(userId, name);
    res.json({ favorite });
  } catch (error) {
    res.json({ favorite: false });
  }
});

router.post('/', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Debes iniciar sesión.' } });
  }
  const name = String(req.body?.name || '').trim();
  const favorite = Boolean(req.body?.favorite);
  if (!name) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Falta el nombre del artista.' } });
  }
  try {
    if (favorite) await addFavoriteArtist(userId, name);
    else await removeFavoriteArtist(userId, name);
    const favorites = await getFavoriteArtists(userId);
    res.json({ ok: true, favorites });
  } catch (error) {
    console.error('Save artist favorite error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No se pudo guardar el favorito.' } });
  }
});

export default router;