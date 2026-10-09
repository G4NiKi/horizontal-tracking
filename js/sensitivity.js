/*
 * Converts in-game sensitivity into on-canvas movement.
 * The canvas is treated as the game screen. A target near the crosshair moves across the canvas at the same
 * proportion of the screen width per hand movement as it does in game (edges are not matched, since perspective
 * stretches them). Mouse counts already include DPI, so no DPI input is needed.
 */

export const VALORANT = { yaw: 0.07, hfov: 103 }; // degrees per count at sensitivity 1, horizontal FOV in degrees
export const SENS_DEFAULT = 0.4, SENS_MIN = 0.01, SENS_MAX = 10;

/** Pixels per mouse count, using the angular scale at the center of the screen (where tracking happens). */
export function pxPerCount(sens, width, game = VALORANT) {
  const pxPerDeg = (width / 2) / Math.tan(game.hfov / 2 * Math.PI / 180) * Math.PI / 180;
  return game.yaw * sens * pxPerDeg;
}

/** Parses user input into a valid sensitivity, or returns null. */
export function parseSens(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= SENS_MIN && n <= SENS_MAX ? n : null;
}
