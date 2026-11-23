// North is world -Z; the vehicle's forward axis is +Z at yaw zero.
export const MAP_SPAN = 240;
export const MAP_SIZE = 192;
export function projectMap(x: number, z: number, centerX: number, centerZ: number) {
  return { x: MAP_SIZE / 2 + (x - centerX) * MAP_SIZE / MAP_SPAN,
    y: MAP_SIZE / 2 + (z - centerZ) * MAP_SIZE / MAP_SPAN };
}
export const mapHeading = (yaw: number) => Math.PI - yaw;
export const mapExpanded = (narrow: boolean, hasDriven: boolean, manual: boolean | null) =>
  manual ?? (!narrow || hasDriven);

export const CAMERA_HEIGHTS = [4, 4.8, 14] as const;
export const clampHeight = (height: number) =>
  Number.isFinite(height) ? Math.max(2, Math.min(18, height)) : CAMERA_HEIGHTS[0];
export function cameraOffset(mode: number, height: number, framing: number) {
  const [x, z] = [[0, -9.8], [-10.5, 3], [0, -0.4]][mode];
  const y = clampHeight(height), horizontal = Math.hypot(x, z);
  // Lowering the overhead view also backs it away from the vehicle.
  const distance = Math.max(horizontal, Math.sqrt(Math.max(0, 9.5 ** 2 - y ** 2)));
  return { x: x / horizontal * distance * framing, y: y * framing,
    z: z / horizontal * distance * framing };
}
export const safeCameraY = (height: number, ground: number) => Math.max(height, ground + 1.2);
export const controlNavigationKey = (code: string) =>
  ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Home", "End", "PageUp", "PageDown"].includes(code);
