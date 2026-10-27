import { useMemo } from 'react';
import type { MapDocument } from '../../shared/model.ts';
import { layoutMap, edgePath } from '../lib/layout';
import { themes } from '../lib/themes';

export function MapPreview({ map, className = '' }: { map: MapDocument; className?: string }) {
  const layout = useMemo(() => layoutMap(map), [map]);
  const theme = themes[map.theme] ?? themes.studio;
  const { x, y, width, height } = layout.bounds;
  return <svg className={`map-preview ${className}`} viewBox={`${x} ${y} ${width} ${height}`} style={{ background: theme.background }} aria-label={`Prévia do mapa ${map.title}`} role="img">
    <defs><pattern id={`dots-${map.id}`} width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill={theme.border} /></pattern></defs>
    <rect x={x} y={y} width={width} height={height} fill={`url(#dots-${map.id})`} />
    {layout.edges.map(edge => <path key={edge.id} d={edgePath(edge.source, edge.target)} fill="none" stroke={edge.color} strokeWidth={edge.source.depth === 0 ? 4 : 2.2} opacity=".8" />)}
    {layout.nodes.map(node => <g key={node.id}><rect x={node.x} y={node.y} width={node.width} height={node.height} rx={node.depth === 0 ? 20 : 12} fill={node.depth === 0 ? theme.root : theme.surface} stroke={node.depth === 0 ? theme.root : node.color} strokeWidth={node.depth === 0 ? 0 : 1.8} />
      {node.lines.slice(0, 3).map((line, index) => <text key={index} x={node.x + node.width / 2} y={node.y + 27 + index * 21} fontSize={node.depth === 0 ? 18 : 15} fontWeight={node.depth < 2 ? 700 : 500} textAnchor="middle" fill={node.depth === 0 ? theme.rootText : theme.text} fontFamily="Manrope, sans-serif">{line}</text>)}
    </g>)}
  </svg>;
}
