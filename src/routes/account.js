import express from 'express';
import { authenticateUser, createUser, getUserById } from '../services/users.js';

const router = express.Router();

function invalid(message, status = 400) {
  return res => res.status(status).json({
    ok: false,
    error: { code: 'INVALID_INPUT', message }
  });
}

router.post('/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const email = req.body?.email ? String(req.body.email).trim() : null;
  const confirmPassword = req.body?.confirmPassword != null
    ? String(req.body.confirmPassword)
    : null;

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return invalid('El usuario debe tener entre 3 y 32 caracteres (letras, números, punto, guion o guion bajo).')(res);
  }
  if (password.length < 6) {
    return invalid('La contraseña debe tener al menos 6 caracteres.')(res);
  }
  if (confirmPassword !== null && confirmPassword !== password) {
    return invalid('Las contraseñas no coinciden.')(res);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return invalid('El correo electrónico no es válido.')(res);
  }

  try {
    const user = await createUser({ username, password, email });
    req.session.user = { id: user.id, username: user.username };
    return res.status(201).json({ ok: true, user });
  } catch (error) {
    if (error?.code === 'USERNAME_TAKEN' || error?.code === 'EMAIL_TAKEN') {
      return res.status(409).json({
        ok: false,
        error: { code: error.code, message: error.message }
      });
    }
    if (String(error?.message || '').includes('UNIQUE constraint')) {
      return res.status(409).json({
        ok: false,
        error: { code: 'DUPLICATE', message: 'El usuario o correo ya existe.' }
      });
    }
    console.error('Register error:', error);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'No se pudo crear la cuenta.' }
    });
  }
});

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Usuario y contraseña son obligatorios.' }
    });
  }

  const user = await authenticateUser(username, password);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos.' }
    });
  }

  req.session.user = { id: user.id, username: user.username };
  return res.json({ ok: true, user });
});

router.post('/logout', (req, res) => {
  if (req.session) req.session.user = null;
  return res.json({ ok: true });
});

router.get('/session', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) {
    return res.json({ authenticated: false, user: null });
  }
  const user = await getUserById(sessionUser.id);
  if (!user) {
    if (req.session) req.session.user = null;
    return res.json({ authenticated: false, user: null });
  }
  return res.json({ authenticated: true, user });
});

router.get('/me', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) return res.json(null);
  const user = await getUserById(sessionUser.id);
  if (!user) {
    if (req.session) req.session.user = null;
    return res.json(null);
  }
  return res.json(user);
});

export default router;
