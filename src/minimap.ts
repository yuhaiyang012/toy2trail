import { baseHeight, waterDepth, mudAmount, grassAmount, nearbyRocks, type Rock } from "./terrain";
import { MAP_SIZE, MAP_SPAN, projectMap, mapHeading, mapExpanded } from "./navigation";
import { ANIMAL_CAMP, CAMP_ROUTE, campGuidance } from "./destination";
import { deliveryGuidance, type DeliveryState } from "./delivery";

const RASTER_SIZE = 112, CACHE_SPAN = MAP_SPAN + 40;
const COLORS = { water: [92, 155, 164], mud: [134, 117, 88], grass: [145, 163, 112], sand: [207, 195, 154] };
export function createMinimap(hidden: boolean) {
  const panel = document.getElementById("minimap")!;
  const toggle = document.getElementById("map-toggle") as HTMLButtonElement;
  const content = document.getElementById("map-content")!;
  const canvas = document.getElementById("minimap-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const raster = document.createElement("canvas");
  raster.width = raster.height = RASTER_SIZE;
  const rasterCtx = raster.getContext("2d")!;
  const pixels = rasterCtx.createImageData(RASTER_SIZE, RASTER_SIZE);
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = canvas.height = MAP_SIZE * dpr;
  ctx.scale(dpr, dpr);
  let manual: boolean | null = null, hasDriven = false, expanded = false;
  let cacheX = Infinity, cacheZ = Infinity, lastTerrain = -Infinity, terrainPaints = 0;
  let lastPaint = -Infinity, rocks: Rock[] = [];
  function setExpanded(next: boolean) {
    if (expanded !== next) lastPaint = -Infinity;
    expanded = next;
    content.hidden = !next;
    toggle.setAttribute("aria-expanded", String(next));
    toggle.setAttribute("aria-label", next ? "收起周边地图" : "展开周边地图");
    toggle.querySelector("span")!.textContent = next ? "−" : "+";
    panel.classList.toggle("collapsed", !next);
    document.body.classList.toggle("map-open", next && !hidden);
  }
  toggle.onclick = () => { manual = !expanded; setExpanded(manual); };
  setExpanded(mapExpanded(innerWidth <= 800, hasDriven, manual));

  function terrain(x: number, z: number, now: number) {
    cacheX = x; cacheZ = z; lastTerrain = now;
    for (let row = 0; row < RASTER_SIZE; row++) {
      for (let col = 0; col < RASTER_SIZE; col++) {
        const wx = x + ((col + .5) / RASTER_SIZE - .5) * CACHE_SPAN;
        const wz = z + ((row + .5) / RASTER_SIZE - .5) * CACHE_SPAN;
        const color = waterDepth(wx, wz) > .01 ? COLORS.water
          : mudAmount(wx, wz) > .4 ? COLORS.mud
          : grassAmount(wx, wz) > .4 ? COLORS.grass : COLORS.sand;
        const shade = Math.max(-10, Math.min(10, baseHeight(wx, wz) * 1.6));
        const offset = (row * RASTER_SIZE + col) * 4;
        for (let c = 0; c < 3; c++) pixels.data[offset + c] = color[c] + shade;
        pixels.data[offset + 3] = 255;
      }
    }
    rasterCtx.putImageData(pixels, 0, 0);
    rocks = nearbyRocks(x, z, CACHE_SPAN / 2 + 6);
    panel.dataset.terrainPaints = String(++terrainPaints);
  }
  return {
    update(now: number, x: number, z: number, yaw: number, driving: boolean, completed = false, delivery?: Readonly<DeliveryState>) {
      if (hidden) return;
      if (driving) hasDriven = true;
      const next = mapExpanded(innerWidth <= 800, hasDriven, manual);
      if (next !== expanded) setExpanded(next);
      Object.assign(panel.dataset, { centerX: x.toFixed(3), centerZ: z.toFixed(3), heading: mapHeading(yaw).toFixed(5) });
      if (!expanded || now - lastPaint < 33) return;
      lastPaint = now;
      const movement = Math.hypot(x - cacheX, z - cacheZ);
      // Overscan permits smooth translation between bounded, 4 Hz terrain updates.
      if (movement > 15 || (now - lastTerrain >= 250 && movement > .75)) terrain(x, z, now);
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
      const center = projectMap(cacheX, cacheZ, x, z);
      const extent = CACHE_SPAN / MAP_SPAN * MAP_SIZE;
      ctx.drawImage(raster, center.x - extent / 2, center.y - extent / 2, extent, extent);
      ctx.strokeStyle = "#ffffff25";
      ctx.lineWidth = .6;
      ctx.beginPath();
      for (let grid = -120; grid <= 120; grid += 40) {
        const p = projectMap(Math.floor(x / 40) * 40 + grid, Math.floor(z / 40) * 40 + grid, x, z);
        ctx.moveTo(p.x, 0); ctx.lineTo(p.x, MAP_SIZE);
        ctx.moveTo(0, p.y); ctx.lineTo(MAP_SIZE, p.y);
      }
      ctx.stroke();
      ctx.fillStyle = "#686b60";
      for (const rock of rocks) {
        const p = projectMap(rock.x, rock.z, x, z);
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.8, rock.radius * MAP_SIZE / MAP_SPAN), 0, Math.PI * 2); ctx.fill();
      }
      const guidance = delivery ? deliveryGuidance(x, z, delivery, 18) : {
        target: ANIMAL_CAMP, path: CAMP_ROUTE, next: campGuidance(x, z, 18).target,
        color: completed ? "#3b8057" : "#b27a13", active: !completed,
      };
      if (guidance.active) {
        // Canvas clips the route to the local map; the off-map flag stays at the edge.
        ctx.save();
        ctx.lineWidth = 4; ctx.strokeStyle = "#fff5d6d9"; ctx.lineJoin = "round";
        ctx.beginPath();
        guidance.path.forEach((point, i) => {
          const p = projectMap(point.x, point.z, x, z);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = guidance.color; ctx.setLineDash([4, 3]); ctx.stroke();
        ctx.setLineDash([]);
        const p = projectMap(guidance.next.x, guidance.next.z, x, z);
        ctx.fillStyle = guidance.color; ctx.strokeStyle = "#fff8dd"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      const target = projectMap(guidance.target.x, guidance.target.z, x, z), dx = target.x - MAP_SIZE / 2, dy = target.y - MAP_SIZE / 2;
      const scale = Math.min(1, (MAP_SIZE / 2 - 12) / Math.max(Math.abs(dx), Math.abs(dy), .001));
      const marker = { x: MAP_SIZE / 2 + dx * scale, y: MAP_SIZE / 2 + dy * scale, outside: scale < 1, angle: Math.atan2(dy, dx) };
      Object.assign(panel.dataset, { targetX: String(guidance.target.x), targetZ: String(guidance.target.z), targetOutside: String(marker.outside), targetMapX: marker.x.toFixed(2), targetMapY: marker.y.toFixed(2), destinationComplete: String(completed), targetKind: delivery?.phase === "pickup" ? "food" : "camp" });
      ctx.save(); ctx.translate(marker.x, marker.y);
      ctx.fillStyle = guidance.color; ctx.strokeStyle = "#fff9e6"; ctx.lineWidth = 2;
      if (marker.outside) {
        ctx.rotate(marker.angle);
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff9e6"; ctx.lineWidth = 1.5;
        if (delivery?.phase === "pickup") { ctx.strokeRect(-4, -3, 8, 7); ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 4); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(-2, 5); ctx.lineTo(-2, -5); ctx.lineTo(4, -3); ctx.lineTo(-2, -1); ctx.stroke(); }
      }
      ctx.restore();
      ctx.fillStyle = "#f4f6e7d9";
      ctx.beginPath(); ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2); ctx.rotate(mapHeading(yaw));
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath();
      ctx.fillStyle = "#225ce4"; ctx.fill(); ctx.restore();
      ctx.fillStyle = "#f4f6e7e8"; ctx.fillRect(7, 6, 18, 22);
      ctx.fillStyle = "#33423a"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center"; ctx.fillText("N", 16, 21);
    },
  };
}
