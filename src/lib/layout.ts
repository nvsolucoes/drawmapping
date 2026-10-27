import type { MapDocument, MapNode } from '../../shared/model.ts';
import { themes } from './themes.ts';

export interface LayoutNode { id: string; x: number; y: number; width: number; height: number; lines: string[]; color: string; side: 'left' | 'right'; depth: number; node: MapNode }
export interface MapLayout { nodes: LayoutNode[]; edges: { id: string; source: LayoutNode; target: LayoutNode; color: string }[]; bounds: { x: number; y: number; width: number; height: number } }

export function wrapText(text: string, maxChars = 25): string[] {
  const lines: string[] = [];
  // Wide letters take more room than narrow ones in Manrope; count them accordingly.
  const width = (value: string) => Array.from(value).reduce((sum, char) => sum + (/[MW@%]/.test(char) ? 1.55 : /[mw]/.test(char) ? 1.3 : /[ilI.,'!| ]/.test(char) ? .55 : 1), 0);
  for (const paragraph of (text || 'Novo tópico').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (width(word) > maxChars || word.length > maxChars) {
        if (line) { lines.push(line); line = ''; }
        let part = '';
        for (const char of Array.from(word)) {
          if (part && (width(part + char) > maxChars || (part + char).length > maxChars)) { lines.push(part); part = ''; }
          part += char;
        }
        if (part) lines.push(part);
      } else if (line && (width(line + ' ' + word) > maxChars || (line + ' ' + word).length > maxChars)) { lines.push(line); line = word; }
      else line += (line ? ' ' : '') + word;
    }
    if (line || !lines.length) lines.push(line || 'Novo tópico');
  }
  return lines;
}

export function descendants(nodes: MapNode[], id: string): Set<string> {
  const found = new Set<string>();
  const queue = [id];
  const children = new Map<string, string[]>();
  for (const node of nodes) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  while (queue.length) {
    const current = queue.pop()!;
    if (found.has(current)) continue;
    found.add(current); queue.push(...(children.get(current) ?? []));
  }
  return found;
}

export function layoutMap(map: MapDocument, options: { expandAll?: boolean; ignoreManual?: boolean; visibleIds?: ReadonlySet<string> } = {}): MapLayout {
  const root = map.nodes.find(node => node.parentId === null);
  if (!root) return { nodes: [], edges: [], bounds: { x: 0, y: 0, width: 1, height: 1 } };
  const childMap = new Map<string, MapNode[]>();
  for (const node of map.nodes) if (node.parentId) childMap.set(node.parentId, [...(childMap.get(node.parentId) ?? []), node]);
  const sizes = new Map<string, { width: number; height: number; lines: string[] }>();
  for (const node of map.nodes) {
    const isRoot = node.id === root.id;
    const lines = wrapText(node.text, isRoot ? 18 : 19);
    sizes.set(node.id, { width: isRoot ? 270 : 224, height: Math.max(isRoot ? 106 : 62, lines.length * (isRoot ? 28 : 23) + (isRoot ? 50 : 38)) + (node.image ? 128 : 0), lines });
  }
  const visibleChildren = (node: MapNode) => !options.expandAll && node.collapsed ? [] : (childMap.get(node.id) ?? []).filter(child => !options.visibleIds || options.visibleIds.has(child.id));
  const spans = new Map<string, number>();
  const measure = (node: MapNode): number => {
    if (spans.has(node.id)) return spans.get(node.id)!;
    const children = visibleChildren(node);
    const span = Math.max(sizes.get(node.id)!.height, children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, children.length - 1) * 24);
    spans.set(node.id, span); return span;
  };
  measure(root);
  const result: LayoutNode[] = [];
  const palette = themes[map.theme]?.palette ?? themes.studio.palette;
  const place = (node: MapNode, x: number, center: number, side: 'left' | 'right', depth: number, color: string) => {
    const size = sizes.get(node.id)!;
    const position = !options.ignoreManual && node.position ? node.position : { x, y: center - size.height / 2 };
    const item: LayoutNode = { ...size, id: node.id, x: position.x, y: position.y, node, side, depth, color: node.color || color };
    result.push(item);
    const children = visibleChildren(node);
    const total = children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, children.length - 1) * 24;
    let cursor = center - total / 2;
    for (const child of children) {
      const span = measure(child);
      const nextX = side === 'right' ? x + size.width + 78 : x - sizes.get(child.id)!.width - 78;
      place(child, nextX, cursor + span / 2, side, depth + 1, item.color);
      cursor += span + 24;
    }
  };
  const rootSize = sizes.get(root.id)!;
  result.push({ ...rootSize, id: root.id, x: !options.ignoreManual && root.position ? root.position.x : 0, y: !options.ignoreManual && root.position ? root.position.y : -rootSize.height / 2, node: root, side: 'right', depth: 0, color: root.color || themes[map.theme]?.root || themes.studio.root });
  const first = visibleChildren(root);
  const allFirst = childMap.get(root.id) ?? [];
  const firstOrder = new Map(allFirst.map((node, index) => [node.id, index]));
  const sides = map.orientation === 'right' ? { left: [], right: first } : { left: first.filter(node => firstOrder.get(node.id)! % 2 === 1), right: first.filter(node => firstOrder.get(node.id)! % 2 === 0) };
  for (const side of ['left', 'right'] as const) {
    const branches = sides[side];
    const total = branches.reduce((sum, node) => sum + measure(node), 0) + Math.max(0, branches.length - 1) * 44;
    let cursor = -total / 2;
    for (const node of branches) {
      const span = measure(node);
      place(node, side === 'right' ? rootSize.width + 102 : -sizes.get(node.id)!.width - 102, cursor + span / 2, side, 1, palette[firstOrder.get(node.id)! % palette.length]!);
      cursor += span + 44;
    }
  }
  const index = new Map(result.map(node => [node.id, node]));
  const edges = result.filter(node => node.node.parentId && index.has(node.node.parentId)).map(node => ({ id: `${node.node.parentId}-${node.id}`, source: index.get(node.node.parentId!)!, target: node, color: node.color }));
  const minX = Math.min(...result.map(node => node.x)) - 50, minY = Math.min(...result.map(node => node.y)) - 50;
  const maxX = Math.max(...result.map(node => node.x + node.width)) + 50, maxY = Math.max(...result.map(node => node.y + node.height)) + 50;
  return { nodes: result, edges, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

export function edgePath(source: LayoutNode, target: LayoutNode): string {
  const left = target.x + target.width / 2 < source.x + source.width / 2;
  const x1 = left ? source.x : source.x + source.width;
  const x2 = left ? target.x + target.width : target.x;
  const y1 = source.y + source.height / 2, y2 = target.y + target.height / 2;
  const middle = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
}

/** Preserve the current top-to-bottom order of visible siblings before clearing manual positions. */
export function orderNodesByVisualPosition(map: MapDocument): string[] {
  const visible = new Map(layoutMap(map).nodes.map(item => [item.id, item]));
  const rootId = map.nodes.find(node => node.parentId === null)?.id;
  const positionsByParent = new Map<string, number[]>();
  map.nodes.forEach((node, index) => {
    if (node.parentId) positionsByParent.set(node.parentId, [...(positionsByParent.get(node.parentId) ?? []), index]);
  });
  const result = map.nodes.map(node => node.id);
  for (const [parentId, slots] of positionsByParent) {
    if (slots.length < 2 || slots.some(index => !visible.has(map.nodes[index]!.id))) continue;
    const sortByCenter = (a: number, b: number) => {
      const first = visible.get(map.nodes[a]!.id)!, second = visible.get(map.nodes[b]!.id)!;
      return (first.y + first.height / 2) - (second.y + second.height / 2) || a - b;
    };
    if (parentId === rootId && map.orientation !== 'right') {
      // The bilateral layout assigns alternating root children to each side.
      // Sort within each side so organization does not swap sides unexpectedly.
      for (const parity of [0, 1]) {
        const sideSlots = slots.filter((_, index) => index % 2 === parity);
        const sorted = [...sideSlots].sort(sortByCenter);
        sideSlots.forEach((slot, index) => { result[slot] = map.nodes[sorted[index]!]!.id; });
      }
    } else {
      const sorted = [...slots].sort(sortByCenter);
      slots.forEach((slot, index) => { result[slot] = map.nodes[sorted[index]!]!.id; });
    }
  }
  return result;
}
