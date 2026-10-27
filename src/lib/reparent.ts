import type { MapDocument } from '../../shared/model.ts';
import { descendants } from './layout.ts';
import type { LayoutNode } from './layout.ts';

/** Only offer nearby visible topics; dropping in empty space keeps the current parent. */
export function findDropParent(map: MapDocument, nodes: LayoutNode[], id: string, position: { x: number; y: number }): LayoutNode | null {
  const dragged = nodes.find(item => item.id === id);
  if (!dragged?.node.parentId) return null;
  const excluded = descendants(map.nodes, id);
  const x = position.x + dragged.width / 2, y = position.y + dragged.height / 2;
  let best: LayoutNode | null = null, bestDistance = Infinity;
  for (const item of nodes) {
    if (excluded.has(item.id)) continue;
    const dx = Math.max(item.x - x, 0, x - (item.x + item.width));
    const dy = Math.max(item.y - y, 0, y - (item.y + item.height));
    if (Math.hypot(dx, dy) > 32) continue;
    const distance = Math.hypot(x - (item.x + item.width / 2), y - (item.y + item.height / 2));
    if (distance < bestDistance) { best = item; bestDistance = distance; }
  }
  return best;
}

/** Place the moved branch beside its new parent instead of leaving cards on top of each other. */
export function placeNearParent(map: MapDocument, nodes: LayoutNode[], dragged: LayoutNode, parent: LayoutNode, position: { x: number; y: number }) {
  const excluded = descendants(map.nodes, dragged.id);
  const left = parent.depth > 0 ? parent.side === 'left' : position.x + dragged.width / 2 < parent.x + parent.width / 2;
  const x = left ? parent.x - dragged.width - 78 : parent.x + parent.width + 78;
  const centerY = parent.y + parent.height / 2 - dragged.height / 2;
  const occupied = nodes.filter(item => !excluded.has(item.id));
  const moving = nodes.filter(item => excluded.has(item.id));
  const step = dragged.height + 24;
  for (let index = 0; index < 100; index++) {
    const offset = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? 1 : -1);
    const y = centerY + offset * step;
    const dx = x - dragged.x, dy = y - dragged.y;
    if (moving.every(part => occupied.every(item => part.x + dx + part.width + 12 <= item.x || part.x + dx >= item.x + item.width + 12 || part.y + dy + part.height + 12 <= item.y || part.y + dy >= item.y + item.height + 12))) return { x, y };
  }
  return { x, y: centerY };
}
