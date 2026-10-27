import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Home, Pause, Play, X } from 'lucide-react';
import type { MapDocument } from '../../shared/model.ts';
import { IconButton } from './Common';

export interface PresentationStep { focusId: string | null; visibleIds: Set<string>; label: string }

export function buildPresentation(map: MapDocument): PresentationStep[] {
  const root = map.nodes.find(node => !node.parentId);
  if (!root) return [];
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  const scenes = map.scenes.length ? map.scenes : map.nodes.filter(node => node.parentId === root.id).map(node => ({ id: node.id, nodeId: node.id, title: node.text }));
  const steps: PresentationStep[] = [{ focusId: null, visibleIds: new Set(map.nodes.filter(node => !node.parentId || node.parentId === root.id).map(node => node.id)), label: 'Uma visão do todo' }];
  for (const scene of scenes) {
    const node = byId.get(scene.nodeId); if (!node) continue;
    const ancestors = new Set([root.id, node.id]); let parent = node.parentId;
    while (parent) { ancestors.add(parent); parent = byId.get(parent)?.parentId ?? null; }
    steps.push({ focusId: node.id, visibleIds: new Set(ancestors), label: scene.title || node.text });
    const revealChildren = (parentId: string) => {
      map.nodes.filter(item => item.parentId === parentId).forEach(child => {
        ancestors.add(child.id);
        steps.push({ focusId: node.id, visibleIds: new Set(ancestors), label: child.text });
        revealChildren(child.id);
      });
    };
    revealChildren(node.id);
  }
  steps.push({ focusId: null, visibleIds: new Set(map.nodes.map(node => node.id)), label: 'Conectando tudo o que vimos' });
  return steps;
}

export function Presentation({ map, onStep, onExit }: { map: MapDocument; onStep: (step: PresentationStep) => void; onExit: () => void }) {
  const steps = useMemo(() => buildPresentation(map), [map]);
  const [index, setIndex] = useState(0), [neutral, setNeutral] = useState(false);
  const next = () => setIndex(value => Math.min(value + 1, steps.length - 1));
  const previous = () => setIndex(value => Math.max(0, value - 1));
  useEffect(() => { if (steps[index]) onStep(steps[index]); }, [steps, index, onStep]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); setIndex(value => Math.min(value + 1, steps.length - 1)); setNeutral(false); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); setIndex(value => Math.max(0, value - 1)); setNeutral(false); }
      if (event.key === 'Home') { event.preventDefault(); setIndex(0); setNeutral(false); }
      if (event.key.toLowerCase() === 'b') { event.preventDefault(); setNeutral(value => !value); }
      if (event.key === 'Escape' && !document.fullscreenElement) onExit();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [steps.length, onExit]);
  return <>
    {neutral && <div className="neutral-screen"><span>Um momento para pensar.</span><button className="button light" onClick={() => setNeutral(false)}><Play size={16} />Retomar apresentação</button></div>}
    <div className="presentation-header"><div><span className="presentation-dot" /><span>{map.title}</span></div><button className="presentation-exit" onClick={onExit}><X size={16} />Sair da apresentação <kbd>Esc</kbd></button></div>
    <div className="presentation-caption" key={`caption-${index}`}><span className="eyebrow">{index === 0 ? 'O PONTO DE PARTIDA' : index === steps.length - 1 ? 'UMA NOVA PERSPECTIVA' : 'CONECTANDO IDEIAS'}</span><h2>{steps[index]?.label}</h2></div>
    <div className="presentation-controls"><IconButton label="Voltar à visão geral" onClick={() => { setIndex(0); setNeutral(false); }}><Home size={18} /></IconButton><span className="control-separator" /><IconButton label="Etapa anterior" disabled={index === 0} onClick={previous}><ArrowLeft size={19} /></IconButton><span className="presentation-count">{String(index + 1).padStart(2, '0')} <small>/ {String(steps.length).padStart(2, '0')}</small></span><IconButton label="Próxima etapa" disabled={index === steps.length - 1} onClick={next}><ArrowRight size={19} /></IconButton><span className="control-separator" /><IconButton label={neutral ? 'Retomar apresentação' : 'Pausar com tela neutra (B)'} onClick={() => setNeutral(value => !value)}>{neutral ? <Play size={18} /> : <Pause size={18} />}</IconButton></div>
    <div className="presentation-progress"><span style={{ width: `${(index + 1) / steps.length * 100}%` }} /></div>
  </>;
}
