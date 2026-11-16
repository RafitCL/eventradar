import { findLyrics as findOnLrclib } from './lrclib.js';

/**
 * Fuente única de letras: LRCLIB (gratuita, sin clave, letra completa y
 * versión sincronizada). Musixmatch se eliminó del pipeline.
 */
export async function findLyrics(artistName, trackName) {
  return findOnLrclib(artistName, trackName);
}
