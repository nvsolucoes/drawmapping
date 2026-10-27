import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, BackgroundVariant, Handle, Position, MiniMap, getBezierPath, useUpdateNodeInternals } from '@xyflow/react';
import type { Node, NodeProps, NodeChange, ReactFlowInstance, EdgeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Plus, StickyNote } from 'lucide-react';
import type { MapDocument } from '../../shared/model.ts';
import type { LayoutNode } from '../lib/layout';
import { layoutMap } from '../lib/layout';
import { themes } from '../lib/themes';
import { assetUrl } from '../lib/api';
import { motionTiming, reflowEase } from '../lib/motion';
import { findDropParent } from '../lib/reparent';
import type { MotionProfile } from '../lib/motion';

interface MindNodeData extends Record<string, unknown> { item: LayoutNode; childCount: number; editing: boolean; presenting: boolean; freePresentation: boolean; freeExpanded: boolean; leaving: boolean; dropTarget: boolean; motion: MotionProfile; replay: number; delay: number; onDraft: (id: string, text: string) => void; onCommit: (id: string) => void; onCancel: (id: string) => void; onEdit: (id: string) => void; onAdd: (id: string) => void; onToggle: (id: string) => void; onFreeToggle: (id: string) => void }
type MindFlowNode = Node<MindNodeData, 'mind'>;

const MindNode = memo(function MindNode({ data, selected }: NodeProps<MindFlowNode>) {
  const { item, childCount, editing, presenting, freePresentation, freeExpanded, leaving, dropTarget, motion, replay, delay, onDraft, onCommit, onCancel, onEdit, onAdd, onToggle, onFreeToggle } = data;
  const entrance = useRef({ replay, enabled: true });
  if (entrance.current.replay !== replay) entrance.current = { replay, enabled: !editing };
  return <div className="mind-node-shell" style={{ position: 'relative', width: item.width, height: item.height }}>
    <Handle type="target" position={Position.Left} id="targetLeft" isConnectable={false} /><Handle type="target" position={Position.Right} id="targetRight" isConnectable={false} /><Handle type="source" position={Position.Left} id="sourceLeft" isConnectable={false} /><Handle type="source" position={Position.Right} id="sourceRight" isConnectable={false} />
    <div key={`${item.id}-${replay}`} className={`mind-node depth-${Math.min(item.depth, 2)} ${selected && !presenting ? 'mind-selected' : ''} ${dropTarget ? 'is-drop-target' : ''} ${item.node.image ? 'has-image' : ''} ${motion !== 'reduced' && entrance.current.enabled ? 'node-arrival' : ''} ${leaving ? 'node-departure' : ''} ${editing ? 'is-editing' : ''}`} data-motion={motion} style={{ width: item.width, height: item.height, '--branch': item.color, '--motion-delay': `${delay}ms`, '--node-duration': `${motionTiming(motion).node}ms` } as React.CSSProperties}>
    <div className="mind-node-text" onDoubleClick={() => !presenting && onEdit(item.id)}>
      {editing ? <textarea className="node-text-input nodrag nopan" style={{ height: Math.max(item.depth === 0 ? 58 : 34, item.height - (item.depth === 0 ? 50 : 38) - (item.node.image ? 128 : 0)) }} aria-label="Texto do tópico" autoFocus value={item.node.text} maxLength={2000} onFocus={event => event.currentTarget.select()} onChange={event => onDraft(item.id, event.target.value)} onBlur={() => onCommit(item.id)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') return; event.stopPropagation(); if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onCommit(item.id); } if (event.key === 'Escape') { event.preventDefault(); onCancel(item.id); } }} /> : <span>{item.lines.map((line, index) => <span className="node-line" key={index}>{line}</span>)}</span>}
    </div>
    {item.node.image && <img className="node-image" src={assetUrl(item.node.image)} alt="Imagem do tópico" draggable={false} />}
    {!presenting && item.node.notes && <span className="node-note-indicator" title="Este tópico tem uma nota"><StickyNote size={12} /></span>}
    {(!presenting || freePresentation) && childCount > 0 && <button className="node-collapse nodrag nopan" aria-label={(freePresentation ? !freeExpanded : item.node.collapsed) ? 'Expandir ramo' : 'Recolher ramo'} onClick={event => { event.stopPropagation(); if (freePresentation) onFreeToggle(item.id); else onToggle(item.id); }}>{(freePresentation ? !freeExpanded : item.node.collapsed) ? <><ChevronRight size={12} /><span>{childCount}</span></> : item.depth ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>}
    {!presenting && selected && !editing && <button className={`node-add nodrag nopan ${item.side === 'left' && item.depth > 0 ? 'node-add-left' : ''}`} aria-label="Adicionar subtópico" onClick={event => { event.stopPropagation(); onAdd(item.id); }}><Plus size={15} /></button>}
    </div>
  </div>;
});
const nodeTypes = { mind: MindNode };

interface OrganicEdgeData { profile: MotionProfile; replay: number; delay: number; leaving: boolean }
function OrganicEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const motion = data as unknown as OrganicEdgeData;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: .43 });
  return <g key={`${id}-${motion.replay}`}><path key={motion.leaving ? 'leaving' : 'visible'} id={id} className={`react-flow__edge-path organic-connector ${motion.leaving ? 'connector-departure' : ''}`} d={path} pathLength={1} fill="none" style={style} />{!motion.leaving && motion.profile !== 'reduced' && <path className="connector-highlight" d={path} pathLength={1} fill="none" aria-hidden="true" style={{ ...style, '--motion-delay': `${motion.delay}ms`, '--line-duration': `${motionTiming(motion.profile).line}ms` } as React.CSSProperties} />}</g>;
}
const edgeTypes = { organic: OrganicEdge };
interface VisualNode { item: LayoutNode; leaving: boolean }
type Positions = Record<string, { x: number; y: number }>;

interface Props {
  map: MapDocument; selectedIds: string[]; editingId: string | null; onSelect: (ids: string[]) => void;
  onDraft: (id: string, text: string) => void; onCommit: (id: string) => void; onCancel: (id: string) => void; onEdit: (id: string) => void; onAdd: (id: string) => void; onToggle: (id: string) => void;
  onMove: (id: string, x: number, y: number, parentId?: string) => void; onReady: (instance: ReactFlowInstance<MindFlowNode>) => void;
  presentation?: { visibleIds: Set<string>; focusId: string | null; free?: boolean; expandedIds?: Set<string>; onFreeToggle?: (id: string) => void }; minimap?: boolean; motion?: MotionProfile; replay?: number; arranging?: boolean;
}

export function Canvas({ map, selectedIds, editingId, onSelect, onDraft, onCommit, onCancel, onEdit, onAdd, onToggle, onMove, onReady, presentation, minimap = false, motion = 'expressive', replay = 0, arranging = false }: Props) {
  const expanded = !!presentation;
  const visibleIds = presentation?.visibleIds;
  const layout = useMemo(() => layoutMap(map, { expandAll: expanded, ignoreManual: expanded, visibleIds }), [map, expanded, visibleIds]);
  const desired = useMemo(() => layout.nodes.filter(item => !visibleIds || visibleIds.has(item.id)), [layout, visibleIds]);
  const [reflowPositions, setReflowPositions] = useState<Positions>(() => Object.fromEntries(desired.map(item => [item.id, { x: item.x, y: item.y }])));
  const positionRef = useRef<Positions>(reflowPositions), targetRef = useRef<Positions>(reflowPositions);
  const positionShapeRef = useRef(desired.map(item => item.id).join('|'));
  const positionFrame = useRef<number | null>(null);
  useLayoutEffect(() => {
    const shape = desired.map(item => item.id).join('|');
    const target = Object.fromEntries(desired.map(item => [item.id, { x: item.x, y: item.y }]));
    const shapeChanged = shape !== positionShapeRef.current;
    const unchanged = !shapeChanged && desired.every(item => targetRef.current[item.id]?.x === item.x && targetRef.current[item.id]?.y === item.y);
    positionShapeRef.current = shape;
    if (unchanged && (motion !== 'reduced' || positionFrame.current === null)) return;
    if (positionFrame.current !== null) { cancelAnimationFrame(positionFrame.current); positionFrame.current = null; }
    targetRef.current = target;
    const duration = motionTiming(motion).reflow;
    if (!shapeChanged || duration === 0) { positionRef.current = target; setReflowPositions(target); return; }
    const from = positionRef.current;
    const start = Object.fromEntries(desired.map(item => [item.id, from[item.id] ?? target[item.id]]));
    positionRef.current = start; setReflowPositions(start);
    let started: number | null = null;
    const frame = (time: number) => {
      started ??= time;
      const progress = Math.min(1, (time - started) / duration), eased = reflowEase(progress);
      const next: Positions = {};
      for (const item of desired) {
        const a = start[item.id]!, b = target[item.id]!;
        next[item.id] = { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased };
      }
      positionRef.current = next; setReflowPositions(next);
      positionFrame.current = progress < 1 ? requestAnimationFrame(frame) : null;
    };
    positionFrame.current = requestAnimationFrame(frame);
  }, [desired, motion]);
  useEffect(() => () => { if (positionFrame.current !== null) cancelAnimationFrame(positionFrame.current); }, []);
  const [visualNodes, setVisualNodes] = useState<VisualNode[]>(() => desired.map(item => ({ item, leaving: false })));
  const visualRef = useRef(visualNodes), removalTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [reflowing, setReflowing] = useState(false);
  const shapeRef = useRef(desired.map(item => item.id).join('|')), reflowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    const ids = new Set(desired.map(item => item.id));
    const next: VisualNode[] = desired.map(item => ({ item, leaving: false }));
    for (const [id, timer] of removalTimers.current) if (ids.has(id) || motion === 'reduced') { clearTimeout(timer); removalTimers.current.delete(id); }
    if (motion !== 'reduced') {
      for (const previous of visualRef.current) if (!ids.has(previous.item.id)) {
        next.push({ item: previous.item, leaving: true });
        if (!removalTimers.current.has(previous.item.id)) {
          const id = previous.item.id;
          removalTimers.current.set(id, setTimeout(() => {
            removalTimers.current.delete(id);
            visualRef.current = visualRef.current.filter(value => value.item.id !== id || !value.leaving);
            setVisualNodes(visualRef.current);
          }, 350));
        }
      }
    }
    const shape = desired.map(item => item.id).join('|');
    if (shape !== shapeRef.current && motion !== 'reduced') {
      setReflowing(true); if (reflowTimer.current) clearTimeout(reflowTimer.current);
      reflowTimer.current = setTimeout(() => setReflowing(false), motionTiming(motion).camera + 100);
    }
    shapeRef.current = shape; visualRef.current = next; setVisualNodes(next);
  }, [desired, motion]);
  useEffect(() => () => { removalTimers.current.forEach(clearTimeout); if (reflowTimer.current) clearTimeout(reflowTimer.current); }, []);
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ draggedId: string; parentId: string } | null>(null);
  const [space, setSpace] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (!presentation && event.code === 'Space' && !(event.target as HTMLElement).closest('input,textarea,select,button,[contenteditable="true"]')) { event.preventDefault(); setSpace(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [presentation]);
  const theme = themes[map.theme] ?? themes.studio;
  const timing = motionTiming(motion);
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  const rootId = map.nodes.find(node => !node.parentId)?.id;
  const branches = map.nodes.filter(node => node.parentId === rootId).map(node => node.id);
  const delayFor = (item: LayoutNode) => {
    if (motion === 'reduced' || item.depth === 0) return 0;
    if (presentation) return 0;
    let ancestor = item.node;
    while (ancestor.parentId && ancestor.parentId !== rootId) ancestor = byId.get(ancestor.parentId)!;
    const branchIndex = Math.max(0, branches.indexOf(ancestor.id));
    const siblingIndex = map.nodes.filter(node => node.parentId === item.node.parentId).findIndex(node => node.id === item.id);
    return Math.min(120, branchIndex * timing.branchGap + (item.depth - 1) * timing.depthGap + siblingIndex * 12);
  };
  const children = useMemo(() => { const count = new Map<string, number>(); map.nodes.forEach(node => { if (node.parentId) count.set(node.parentId, (count.get(node.parentId) ?? 0) + 1); }); return count; }, [map.nodes]);
  const freshItems = new Map(desired.map(item => [item.id, item]));
  const displayed = visualNodes.map(value => freshItems.has(value.item.id) ? { item: freshItems.get(value.item.id)!, leaving: false } : { ...value, leaving: true });
  const updateNodeInternals = useUpdateNodeInternals();
  const displayedIds = displayed.map(value => value.item.id).join('|');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ids = displayedIds ? displayedIds.split('|') : [];
      if (ids.length) updateNodeInternals(ids);
    });
    return () => cancelAnimationFrame(frame);
  }, [displayedIds, updateNodeInternals]);
  // Keep measured dimensions in controlled nodes: React Flow otherwise drops every
  // handle's bounds on each drag render, temporarily removing all edges.
  const nodes: MindFlowNode[] = displayed.map(({ item, leaving }) => ({ id: item.id, type: 'mind', position: drag[item.id] ?? (!leaving ? reflowPositions[item.id] : undefined) ?? { x: item.x, y: item.y }, selected: !leaving && selectedIds.includes(item.id), draggable: !presentation && !leaving, selectable: !presentation && !leaving, width: item.width, height: item.height, measured: { width: item.width, height: item.height }, style: leaving ? { pointerEvents: 'none' } : undefined, data: { item, childCount: children.get(item.id) ?? 0, editing: !leaving && editingId === item.id, presenting: !!presentation || leaving, freePresentation: !!presentation?.free && !leaving, freeExpanded: !!presentation?.expandedIds?.has(item.id), leaving, dropTarget: dropTarget?.parentId === item.id, motion, replay, delay: leaving ? 0 : delayFor(item), onDraft, onCommit, onCancel, onEdit, onAdd, onToggle, onFreeToggle: presentation?.onFreeToggle ?? onToggle } }));
  const visualIndex = new Map(displayed.map(value => [value.item.id, value]));
  const edges = displayed.filter(value => value.item.node.parentId && visualIndex.has(value.item.node.parentId)).map(value => {
    const target = value.item, preview = dropTarget?.draggedId === target.id ? dropTarget.parentId : null;
    const source = visualIndex.get(preview ?? target.node.parentId!)!, leaving = source.leaving || value.leaving;
    const targetX = drag[target.id]?.x ?? reflowPositions[target.id]?.x ?? target.x, sourceX = drag[source.item.id]?.x ?? reflowPositions[source.item.id]?.x ?? source.item.x;
    const left = targetX + target.width / 2 < sourceX + source.item.width / 2;
    return { id: `${source.item.id}-${target.id}`, source: source.item.id, target: target.id, sourceHandle: left ? 'sourceLeft' : 'sourceRight', targetHandle: left ? 'targetRight' : 'targetLeft', type: 'organic', data: { profile: motion, replay, delay: leaving ? 0 : delayFor(target), leaving }, style: { stroke: preview ? source.item.color : target.color, strokeWidth: preview ? 3 : source.item.depth === 0 ? 3.4 : 2 }, selectable: false };
  });
  const changes = useCallback((updates: NodeChange<MindFlowNode>[]) => {
    const positions = updates.filter(update => update.type === 'position' && update.position);
    if (positions.length) setDrag(previous => { const next = { ...previous }; positions.forEach(update => { if (update.type === 'position' && update.position) next[update.id] = update.position; }); return next; });
    const selects = updates.filter(update => update.type === 'select');
    if (selects.length) {
      const set = new Set(selectedIds); selects.forEach(update => { if (update.type === 'select') { if (update.selected) set.add(update.id); else set.delete(update.id); } });
      const next = [...set]; if (next.join(',') !== selectedIds.join(',')) onSelect(next);
    }
  }, [selectedIds, onSelect]);

  return <ReactFlow<MindFlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={changes} onNodeClick={(event, node) => { if (presentation?.free) { if ((children.get(node.id) ?? 0) > 0) presentation.onFreeToggle?.(node.id); } else if (!presentation && !event.ctrlKey && !event.metaKey && !event.shiftKey) onSelect([node.id]); }} onNodeDoubleClick={(_, node) => { if (!presentation) onEdit(node.id); }} onPaneClick={() => { if (!presentation) onSelect([]); }} onNodeDragStart={() => { setDragging(true); setDropTarget(null); }} onNodeDrag={(_, node) => {
    const parent = findDropParent(map, desired, node.id, node.position);
    const currentParent = map.nodes.find(item => item.id === node.id)?.parentId;
    const candidate = parent && parent.id !== currentParent ? { draggedId: node.id, parentId: parent.id } : null;
    setDropTarget(previous => previous?.draggedId === candidate?.draggedId && previous?.parentId === candidate?.parentId ? previous : candidate);
  }} onNodeDragStop={(_, node) => {
    const parent = findDropParent(map, desired, node.id, node.position);
    const currentParent = map.nodes.find(item => item.id === node.id)?.parentId;
    onMove(node.id, node.position.x, node.position.y, parent && parent.id !== currentParent ? parent.id : undefined);
    setDropTarget(null); setDrag({}); setDragging(false);
  }} onInit={onReady} fitView fitViewOptions={{ padding: .18, maxZoom: .9 }} minZoom={.08} maxZoom={2} panOnDrag={presentation ? !!presentation.free : space ? true : [1, 2]} selectionOnDrag={!presentation && !space} selectionKeyCode="Shift" multiSelectionKeyCode={['Control', 'Meta']} deleteKeyCode={null} nodesConnectable={false} edgesFocusable={false} nodesFocusable={!presentation || !!presentation.free} zoomOnDoubleClick={false} zoomOnScroll={!presentation || !!presentation.free} panOnScroll={!presentation} preventScrolling={!presentation || !!presentation.free} attributionPosition="bottom-left" className={`map-canvas motion-${motion} ${motion === 'reduced' ? 'reduced-motion' : ''} ${(arranging || reflowing) && !editingId && !dragging ? 'is-arranging' : ''} ${dragging ? 'is-dragging' : ''} ${presentation ? 'is-presenting' : ''} ${presentation?.free ? 'is-free-presenting' : ''}`} aria-label="Mapa mental: selecione um tópico, Tab cria um filho, Esc devolve o foco à barra" style={{ background: theme.background }}>
    {dropTarget && <div className="drop-hint" role="status">Solte para conectar a <strong>{byId.get(dropTarget.parentId)?.text}</strong></div>}
    <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={theme.border} />
    {minimap && !presentation && <MiniMap pannable zoomable nodeColor={node => (node.data as MindNodeData).item.color} nodeStrokeWidth={0} maskColor={map.theme === 'midnight' ? '#121d2255' : '#f7f8f588'} style={{ background: theme.surface }} />}
  </ReactFlow>;
}

export type { MindFlowNode };
