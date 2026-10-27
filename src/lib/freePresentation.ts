import type { MapDocument } from '../../shared/model.ts';

export function freePresentationVisible(map: MapDocument, expanded: Set<string>): Set<string> {
  const root = map.nodes.find(node => !node.parentId);
  const visible = new Set<string>();
  if (!root) return visible;
  const children = new Map<string, string[]>();
  for (const node of map.nodes) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  const pending = [root.id];
  while (pending.length) {
    const id = pending.pop()!; visible.add(id);
    if (expanded.has(id)) pending.push(...(children.get(id) ?? []));
  }
  return visible;
}

