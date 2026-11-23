/** Pure coordinates shared by rendering, terrain generation and tests. */
export const CHUNK_SIZE = 128;
export const VIEW_RADIUS = 3;
export const MAX_ACTIVE_CHUNKS = (VIEW_RADIUS * 2 + 1) ** 2;
export const MAX_ROCK_CACHE = 128;
export interface Point {
  x: number;
  z: number;
}
export function chunkSeed(x: number, z: number, salt = 98) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
export function activeChunks(x: number, z: number) {
  const cx = Math.floor(x / CHUNK_SIZE),
    cz = Math.floor(z / CHUNK_SIZE);
  const result: (Point & { key: string; distance: number })[] = [];
  for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++)
    for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++)
      result.push({
        x: cx + dx,
        z: cz + dz,
        key: `${cx + dx},${cz + dz}`,
        distance: dx * dx + dz * dz,
      });
  return result.sort((a, b) => a.distance - b.distance);
}
export function renderOrigin(x: number, z: number, current: Point): Point {
  return Math.max(Math.abs(x - current.x), Math.abs(z - current.z)) < 2048
    ? current
    : {
        x: Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE,
        z: Math.floor(z / CHUNK_SIZE) * CHUNK_SIZE,
      };
}
