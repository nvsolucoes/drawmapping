import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactFlowInstance } from '@xyflow/react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, FileImage, FileText, Focus, GitFork, ImagePlus, LayoutList, Maximize, Minus, MousePointer2, Play, Plus, Presentation as PresentationIcon, Redo2, RotateCcw, Search, Settings2, Sparkles, StickyNote, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { MapDocument, MapNode, MapOrientation } from '../../shared/model.ts';
import { useDocument } from '../hooks/useDocument';
import { api, downloadFrom, errorMessage, readImage } from '../lib/api';
import type { Revision } from '../lib/api';
import { descendants, layoutMap, orderNodesByVisualPosition } from '../lib/layout';
import { placeNearParent } from '../lib/reparent';
import { exportRecovery, exportVisual } from '../lib/export';
import { safeFilename, themes } from '../lib/themes';
import { Canvas } from './Canvas';
import type { MindFlowNode } from './Canvas';
import { IconButton, Logo, Modal, MenuPresence } from './Common';
import { Properties } from './Properties';
import { Presentation, buildPresentation } from './Presentation';
import { freePresentationVisible } from '../lib/freePresentation';
import type { PresentationStep } from './Presentation';
import { cameraEase, motionTiming } from '../lib/motion';
import type { MotionProfile } from '../lib/motion';

interface Props { initial: MapDocument; onSaved: (map: MapDocument) => void; onClose: (map: MapDocument) => Promise<void>; notify: (message: string, error?: boolean) => void }
export function Editor(props: Props) { return <ReactFlowProvider><EditorContent {...props} /></ReactFlowProvider>; }

function EditorContent({ initial, onSaved, onClose, notify }: Props) {
  const doc = useDocument(initial, onSaved);
  const { document: map, change, undo, redo, flush, retry, reset, status, error, canUndo, canRedo } = doc;
  const currentRef = useRef(doc.getCurrent); currentRef.current = doc.getCurrent;
  const getCurrent = useCallback(() => currentRef.current(), []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]), [editingId, setEditingId] = useState<string | null>(null);
  const [outline, setOutline] = useState(false), [properties, setProperties] = useState(true), [minimap, setMinimap] = useState(false);
  const [exportMenu, setExportMenu] = useState(false), [busy, setBusy] = useState(false), [help, setHelp] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false), [revisions, setRevisions] = useState<Revision[]>([]), [restoreRevision, setRestoreRevision] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false), [step, setStep] = useState<PresentationStep | null>(null);
  const [presentationMode, setPresentationMode] = useState<'guided' | 'free'>('guided'), [presentMenu, setPresentMenu] = useState(false);
  const [freeExpanded, setFreeExpanded] = useState<Set<string>>(() => new Set());
  const [motion, setMotion] = useState<MotionProfile>(() => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'expressive');
  const reduced = motion === 'reduced';
  const [replay, setReplay] = useState(0), [playing, setPlaying] = useState(false), [arranging, setArranging] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingOrigin = useRef<{ id: string; text: string; historyKey: string } | null>(null);
  const flow = useRef<ReactFlowInstance<MindFlowNode> | null>(null), workspace = useRef<HTMLDivElement>(null), backRef = useRef<HTMLButtonElement>(null), imageRef = useRef<HTMLInputElement>(null), clipboard = useRef<MapNode[]>([]);
  const selected = map.nodes.find(node => node.id === selectedIds[0]);
  const currentLayout = useMemo(() => layoutMap(map), [map]);
  const run = useCallback(async (action: () => Promise<void>) => { setBusy(true); try { await action(); } catch (cause) { notify(errorMessage(cause), true); } finally { setBusy(false); } }, [notify]);
  const fit = useCallback(() => { void flow.current?.fitView({ padding: .2, maxZoom: 1.1, duration: motionTiming(motion).camera, ease: cameraEase, interpolate: 'smooth' }); }, [motion]);
  const select = useCallback((id: string) => { setSelectedIds([id]); void flow.current?.fitView({ nodes: [{ id }], padding: .7, maxZoom: 1.15, duration: motionTiming(motion).camera, ease: cameraEase, interpolate: 'smooth' }); }, [motion]);
  const edit = useCallback((id: string) => {
    const node = getCurrent().nodes.find(item => item.id === id); if (!node) return;
    editingOrigin.current = { id, text: node.text, historyKey: `node-edit-${crypto.randomUUID()}` };
    setSelectedIds([id]); setEditingId(id);
  }, [getCurrent]);
  const draftText = useCallback((id: string, text: string) => {
    change(draft => { const node = draft.nodes.find(item => item.id === id); if (node) node.text = text; }, { historyKey: editingOrigin.current?.id === id ? editingOrigin.current.historyKey : `node-text-${id}` });
  }, [change]);
  const commit = useCallback(() => {
    editingOrigin.current = null; setEditingId(null); workspace.current?.focus();
  }, []);
  const cancel = useCallback((id: string) => {
    const origin = editingOrigin.current;
    if (origin?.id === id) change(draft => { const node = draft.nodes.find(item => item.id === id); if (node) node.text = origin.text; }, { historyKey: origin.historyKey });
    editingOrigin.current = null; setEditingId(null); workspace.current?.focus();
  }, [change]);
  const add = useCallback((parentId?: string, sibling = false) => {
    const current = getCurrent(), root = current.nodes.find(node => !node.parentId)!;
    const selectedNode = current.nodes.find(node => node.id === parentId);
    const actualParent = sibling && selectedNode?.parentId ? selectedNode.parentId : parentId || root.id;
    const id = crypto.randomUUID();
    change(draft => { const parent = draft.nodes.find(node => node.id === actualParent); if (parent) parent.collapsed = false; draft.nodes.push({ id, parentId: actualParent, text: 'Nova ideia' }); });
    editingOrigin.current = { id, text: 'Nova ideia', historyKey: `node-edit-${id}` };
    setSelectedIds([id]); setEditingId(id);
  }, [change, getCurrent]);
  const toggle = useCallback((id: string) => change(draft => { const node = draft.nodes.find(item => item.id === id); if (node) node.collapsed = !node.collapsed; }), [change]);
  const remove = useCallback(() => {
    const current = getCurrent(), ids = new Set<string>();
    selectedIds.forEach(id => { if (current.nodes.find(node => node.id === id)?.parentId) descendants(current.nodes, id).forEach(value => ids.add(value)); });
    if (!ids.size) { notify('O assunto central permanece no mapa. Edite seu texto para mudar a ideia.'); return; }
    change(draft => { draft.nodes = draft.nodes.filter(node => !ids.has(node.id)); }); setSelectedIds([]); setEditingId(null); notify('Tópico removido. Use Ctrl+Z para desfazer.');
  }, [change, getCurrent, selectedIds, notify]);
  const move = useCallback((id: string, x: number, y: number, parentId?: string) => {
    const current = getCurrent(), layout = layoutMap(current), item = layout.nodes.find(node => node.id === id); if (!item) return;
    const ids = descendants(current.nodes, id), parent = parentId && item.node.parentId && !ids.has(parentId) ? layout.nodes.find(node => node.id === parentId) : undefined;
    const destination = parent ? placeNearParent(current, layout.nodes, item, parent, { x, y }) : { x, y };
    const dx = destination.x - item.x, dy = destination.y - item.y;
    change(draft => {
      if (parent) {
        // Preserve the visible composition when the root's automatic branch ordering changes.
        for (const visible of layout.nodes) {
          const existing = draft.nodes.find(node => node.id === visible.id);
          if (existing && !ids.has(existing.id)) existing.position ??= { x: visible.x, y: visible.y };
        }
        const moved = draft.nodes.find(node => node.id === id), newParent = draft.nodes.find(node => node.id === parent.id);
        if (moved && newParent) { moved.parentId = parent.id; newParent.collapsed = false; newParent.position ??= { x: parent.x, y: parent.y }; }
      }
      for (const node of draft.nodes) if (ids.has(node.id)) {
        const position = layout.nodes.find(value => value.id === node.id) ?? node.position;
        if (position) node.position = { x: position.x + dx, y: position.y + dy };
      }
    });
    if (parent) notify(`Tópico conectado a “${parent.node.text}”.`);
  }, [change, getCurrent, notify]);
  const copy = useCallback(() => {
    const current = getCurrent(), ids = new Set<string>(); selectedIds.forEach(id => descendants(current.nodes, id).forEach(value => ids.add(value)));
    clipboard.current = structuredClone(current.nodes.filter(node => ids.has(node.id))); if (clipboard.current.length) notify('Ramo copiado. Ctrl+V cria uma nova conexão.');
  }, [getCurrent, selectedIds, notify]);
  const paste = useCallback(() => {
    if (!clipboard.current.length) return;
    const current = getCurrent(), root = current.nodes.find(node => !node.parentId)!, target = current.nodes.find(node => node.id === selectedIds[0]) ?? root;
    const ids = new Map(clipboard.current.map(node => [node.id, crypto.randomUUID()]));
    const pasted = clipboard.current.map(node => { const value = { ...node, id: ids.get(node.id)!, parentId: (node.parentId && ids.get(node.parentId)) || target.id }; delete value.position; return value; });
    change(draft => { const parent = draft.nodes.find(node => node.id === target.id); if (parent) parent.collapsed = false; draft.nodes.push(...pasted); }); setSelectedIds([pasted[0]!.id]);
  }, [change, getCurrent, selectedIds]);
  const upload = useCallback(async (file?: File) => {
    if (!file || !selectedIds[0]) { if (file) notify('Selecione primeiro o tópico que receberá a imagem.'); return; }
    const id = selectedIds[0]; await run(async () => { const asset = await api.upload(await readImage(file)); change(draft => { const node = draft.nodes.find(item => item.id === id); if (node) node.image = asset.id; }); notify('Imagem incorporada ao mapa.'); });
  }, [selectedIds, run, change, notify]);
  const exitPresentation = useCallback(() => { setPresentation(false); setStep(null); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); setTimeout(fit, 60); }, [fit]);
  const startPresentation = (mode: 'guided' | 'free') => { setEditingId(null); setSelectedIds([]); setPresentMenu(false); setPresentationMode(mode); setFreeExpanded(new Set()); setStep(buildPresentation(getCurrent())[0] ?? null); setPresentation(true); void document.documentElement.requestFullscreen?.().catch(() => {}); };
  const freeVisible = useMemo(() => freePresentationVisible(map, freeExpanded), [map, freeExpanded]);
  const toggleFree = useCallback((id: string) => setFreeExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) for (const child of descendants(getCurrent().nodes, id)) next.delete(child);
    else next.add(id);
    return next;
  }), [getCurrent]);
  const onStep = useCallback((value: PresentationStep) => { setStep(value); setTimeout(() => { void flow.current?.fitView({ nodes: [...value.visibleIds].map(id => ({ id })), padding: .3, maxZoom: value.focusId ? 1.25 : .95, duration: motionTiming(motion).camera, ease: cameraEase, interpolate: 'smooth' }); }, 45); }, [motion]);
  useEffect(() => { const changed = () => { if (!document.fullscreenElement && presentation) exitPresentation(); }; document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed); }, [presentation, exitPresentation]);
  useEffect(() => {
    if (!presentation || presentationMode !== 'free') return;
    const timer = setTimeout(() => { void flow.current?.fitView({ nodes: [...freeVisible].map(id => ({ id })), padding: .3, maxZoom: 1.15, duration: motionTiming(motion).camera, ease: cameraEase, interpolate: 'smooth' }); }, 70);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) exitPresentation(); };
    window.addEventListener('keydown', keydown);
    return () => { clearTimeout(timer); window.removeEventListener('keydown', keydown); };
  }, [presentation, presentationMode, freeVisible, motion, exitPresentation]);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion(preference.matches ? 'reduced' : 'expressive');
    preference.addEventListener('change', update);
    return () => { preference.removeEventListener('change', update); if (replayTimer.current) clearTimeout(replayTimer.current); if (panelTimer.current) clearTimeout(panelTimer.current); };
  }, []);
  const animateMap = () => {
    if (reduced) { notify('O movimento reduzido está ativo nas configurações do sistema.'); return; }
    setPlaying(true); setReplay(value => value + 1); fit();
    if (replayTimer.current) clearTimeout(replayTimer.current);
    replayTimer.current = setTimeout(() => setPlaying(false), motionTiming(motion).node + 300);
  };
  const organize = () => {
    const order = orderNodesByVisualPosition(getCurrent());
    setArranging(true);
    change(draft => { const byId = new Map(draft.nodes.map(node => [node.id, node])); draft.nodes = order.map(id => byId.get(id)!); draft.nodes.forEach(node => delete node.position); });
    setTimeout(fit, 80); setTimeout(() => setArranging(false), motionTiming(motion).camera + 120);
  };
  const changeOrientation = (orientation: MapOrientation) => {
    if ((map.orientation ?? 'balanced') === orientation) return;
    setArranging(true);
    change(draft => { draft.orientation = orientation; draft.nodes.forEach(node => delete node.position); });
    setTimeout(fit, 80); setTimeout(() => setArranging(false), motionTiming(motion).camera + 120);
  };
  const openProperties = () => { if (panelTimer.current) clearTimeout(panelTimer.current); setPanelClosing(false); setProperties(true); };
  const closeProperties = () => {
    if (panelTimer.current) clearTimeout(panelTimer.current);
    if (reduced) { setProperties(false); setPanelClosing(false); return; }
    setPanelClosing(true); panelTimer.current = setTimeout(() => { setProperties(false); setPanelClosing(false); }, 320);
  };
  const toggleProperties = () => { if (properties && !panelClosing) closeProperties(); else openProperties(); };
  const close = () => void run(async () => { const saved = await flush(); await onClose(saved); });
  const exportMap = async (format: 'drawmap' | 'svg' | 'png' | 'pdf') => {
    setExportMenu(false); await run(async () => {
      if (format === 'drawmap') { await flush(); await downloadFrom(`/api/maps/${map.id}/export`, `${safeFilename(getCurrent().title)}.drawmap`); }
      else await exportVisual(getCurrent(), format);
      if (format !== 'pdf') notify('Seu mapa está pronto para levar com você.');
    });
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (presentation || help || historyOpen || restoreRevision) return;
      const target = event.target as HTMLElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void run(async () => { await flush(); }); return; }
      if (target.closest('input,textarea,select,[contenteditable="true"]') || editingId) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copy(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); paste(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); }
      else if (event.key === 'F2' && selectedIds[0]) { event.preventDefault(); edit(selectedIds[0]); }
      else if (event.key === 'Tab' && selectedIds[0] && target.closest('.editor-workspace')) { event.preventDefault(); add(selectedIds[0]); }
      else if (event.key === 'Enter' && selectedIds[0] && target.closest('.editor-workspace')) { event.preventDefault(); add(selectedIds[0], true); }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length && target.closest('.editor-workspace')) { event.preventDefault(); remove(); }
      else if (event.key === 'Escape') { setSelectedIds([]); setEditingId(null); setSearchOpen(false); setExportMenu(false); backRef.current?.focus(); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [presentation, help, historyOpen, restoreRevision, editingId, selectedIds, add, edit, remove, undo, redo, copy, paste, flush, run]);
  const onReady = useCallback((instance: ReactFlowInstance<MindFlowNode>) => { flow.current = instance; }, []);
  const statusText = status === 'saved' ? 'Salvo no computador' : status === 'saving' ? 'Salvando…' : status === 'pending' ? 'Alterações pendentes' : status === 'conflict' ? 'Conflito entre abas' : 'Falha ao salvar';
  const found = search.trim() ? map.nodes.filter(node => node.text.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0, 30) : [];
  useEffect(() => {
    if (!exportMenu) return;
    const closeMenu = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.export-menu,.export-button')) setExportMenu(false); };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [exportMenu]);

  return <div className={`editor-shell theme-${map.theme} ${presentation ? 'presentation-mode' : ''} ${reduced ? 'reduced-motion' : ''}`} style={{ '--canvas-bg': themes[map.theme].background, '--canvas-surface': themes[map.theme].surface, '--canvas-text': themes[map.theme].text, '--canvas-muted': themes[map.theme].muted, '--canvas-border': themes[map.theme].border, '--canvas-root': themes[map.theme].root, '--canvas-root-text': themes[map.theme].rootText } as React.CSSProperties}>
    {!presentation && <header className="editor-header"><div className="editor-brand"><button ref={backRef} className="icon-button back-button" title="Voltar à biblioteca" aria-label="Voltar à biblioteca" disabled={busy} onClick={close}><ArrowLeft size={19} /></button><Logo compact /><span className="header-divider" /><div className="map-title-wrap"><input className="map-title-input" value={map.title} aria-label="Nome do mapa" maxLength={180} onChange={event => change(draft => { draft.title = event.target.value; })} onBlur={() => { if (!map.title.trim()) change(draft => { draft.title = 'Meu mapa'; }); }} /><span className={`save-status save-${status}`} role="status">{status === 'saved' ? <Check size={12} /> : status === 'error' || status === 'conflict' ? <AlertCircle size={12} /> : <span className="saving-dot" />}{statusText}</span></div></div><div className="editor-header-actions"><div className="history-buttons"><IconButton label="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={18} /></IconButton><IconButton label="Refazer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Redo2 size={18} /></IconButton></div><IconButton label="Histórico de versões" onClick={() => void run(async () => { await flush(); setRevisions(await api.revisions(map.id)); setHistoryOpen(true); })}><Clock3 size={18} /></IconButton><div className="dropdown-wrap"><button className="button subtle export-button" disabled={busy} onClick={() => setExportMenu(value => !value)}><ArrowDownToLine size={16} /><span>Exportar</span><ChevronDown size={13} /></button><MenuPresence show={exportMenu}><div className="dropdown-menu export-menu"><span className="dropdown-caption">LEVE SUAS IDEIAS</span><button onClick={() => void exportMap('drawmap')}><GitFork size={16} /><span>Mapa editável<small>.drawmap · inclui imagens</small></span></button><button onClick={() => void exportMap('png')}><FileImage size={16} /><span>Imagem PNG<small>Para compartilhar e inserir em aulas</small></span></button><button onClick={() => void exportMap('svg')}><Sparkles size={16} /><span>Vetor SVG<small>Detalhes em qualquer tamanho</small></span></button><button onClick={() => void exportMap('pdf')}><FileText size={16} /><span>Imprimir / PDF<small>Salvar como PDF no navegador</small></span></button></div></MenuPresence></div><div className="dropdown-wrap"><button className="button primary present-button" aria-expanded={presentMenu} onClick={() => setPresentMenu(value => !value)}><PresentationIcon size={17} />Apresentar<ChevronDown size={14} /></button>{presentMenu && <div className="dropdown-menu presentation-menu"><button onClick={() => startPresentation('free')}><MousePointer2 size={17} /><span>Apresentação livre<small>Abra os tópicos na ordem que quiser</small></span></button><button onClick={() => startPresentation('guided')}><PresentationIcon size={17} /><span>Com roteiro<small>Avance pelas etapas preparadas</small></span></button></div>}</div></div></header>}
    {(status === 'error' || status === 'conflict') && !presentation && <div className="save-error-banner" role="alert"><AlertCircle size={18} /><div><strong>{status === 'conflict' ? 'Este mapa mudou em outra aba.' : 'As alterações ainda estão nesta sessão.'}</strong><span>{error}</span></div><button className="button small" onClick={() => void run(async () => { await exportRecovery(getCurrent()); notify('Cópia de recuperação exportada.'); })}>Exportar minha cópia</button>{status === 'conflict' ? <button className="button small" onClick={() => void run(async () => { await exportRecovery(getCurrent()); reset(await api.map(map.id)); notify('Cópia exportada e versão atual carregada.'); })}>Exportar e recarregar</button> : <button className="button small" onClick={() => void retry()}>Tentar salvar</button>}</div>}
    <div className="editor-body">
      {!presentation && <div className="editor-toolrail"><IconButton label="Selecionar e mover tópicos" className="active" onClick={() => { setEditingId(null); workspace.current?.focus(); }}><MousePointer2 size={20} /></IconButton><span className="rail-divider" /><IconButton label="Adicionar tópico" onClick={() => add(selectedIds[0])}><Plus size={21} /></IconButton><IconButton label="Adicionar imagem ao tópico" disabled={!selected} onClick={() => imageRef.current?.click()}><ImagePlus size={20} /></IconButton><IconButton label="Notas e propriedades" onClick={toggleProperties}><StickyNote size={20} /></IconButton><span className="rail-divider" /><IconButton label="Mostrar estrutura do mapa" className={outline ? 'active' : ''} onClick={() => setOutline(value => !value)}><LayoutList size={20} /></IconButton><IconButton label="Pesquisar tópico (Ctrl+F)" className={searchOpen ? 'active' : ''} onClick={() => setSearchOpen(value => !value)}><Search size={20} /></IconButton><div className="rail-bottom"><IconButton label="Atalhos e dicas" onClick={() => setHelp(true)}><CircleHelp size={20} /></IconButton></div></div>}
      {outline && !presentation && <aside className="outline-panel"><div className="panel-title"><span>Uma ideia leva à outra</span><IconButton label="Fechar estrutura" onClick={() => setOutline(false)}><X size={16} /></IconButton></div><div className="outline-list"><Outline map={map} parentId={null} selectedId={selected?.id} select={select} toggle={toggle} /></div><div className="outline-footer"><span>{map.nodes.length} tópicos conectados</span><button className="text-button small" onClick={() => add(selectedIds[0])}><Plus size={14} />Nova ideia</button></div></aside>}
      <div className="editor-workspace" ref={workspace} tabIndex={0}>
        <Canvas map={map} selectedIds={selectedIds} editingId={editingId} onSelect={setSelectedIds} onDraft={draftText} onCommit={commit} onCancel={cancel} onEdit={edit} onAdd={add} onToggle={toggle} onMove={move} onReady={onReady} presentation={presentation ? presentationMode === 'free' ? { visibleIds: freeVisible, focusId: null, free: true, expandedIds: freeExpanded, onFreeToggle: toggleFree } : step ?? undefined : undefined} minimap={minimap} motion={motion} replay={replay} arranging={arranging} />
        {!reduced && <div key={map.theme} className="theme-transition" aria-hidden="true" />}
        {!presentation && <div className="motion-toolbar" aria-label="Animações do mapa"><button className={`motion-replay-button ${playing ? 'is-playing' : ''}`} disabled={!!editingId} aria-label="Animar mapa" title={editingId ? 'Conclua a edição para animar o mapa' : 'Ver os ramos ganharem vida, um por um'} onClick={animateMap}><Play size={14} fill="currentColor" /><span>{playing ? 'Repetir animação' : 'Animar mapa'}</span></button></div>}
        {playing && !presentation && !reduced && <div className="motion-playback-indicator" role="status"><span />As ideias ganham vida</div>}
        {!presentation && <><div className="canvas-label"><span className="canvas-label-dot" /><span>{map.folder || 'MEU ESTÚDIO'}</span><span>/</span><strong>Mapa mental</strong></div>{searchOpen && <div className="canvas-search"><div><Search size={17} /><input aria-label="Buscar tópico no mapa" autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Qual ideia você procura?" /><IconButton label="Fechar busca" onClick={() => { setSearchOpen(false); setSearch(''); }}><X size={15} /></IconButton></div>{search && <div className="search-results">{found.length ? found.map(node => <button key={node.id} onClick={() => { change(draft => { let parent = node.parentId; while (parent) { const value = draft.nodes.find(item => item.id === parent); if (!value) break; value.collapsed = false; parent = value.parentId; } }); setTimeout(() => select(node.id), 30); }}><Search size={13} /><span>{node.text}</span></button>) : <p>Nenhum tópico com esse texto.</p>}</div>}</div>}
        <div className="canvas-bottom-left"><div className="zoom-controls"><IconButton label="Diminuir zoom" onClick={() => void flow.current?.zoomOut({ duration: reduced ? 0 : 200 })}><ZoomOut size={17} /></IconButton><button className="zoom-label" onClick={fit} title="Ajustar mapa à tela">Ajustar</button><IconButton label="Aumentar zoom" onClick={() => void flow.current?.zoomIn({ duration: reduced ? 0 : 200 })}><ZoomIn size={17} /></IconButton><span className="control-separator" /><IconButton label="Centralizar mapa" onClick={fit}><Maximize size={16} /></IconButton></div><button className={`canvas-small-button ${minimap ? 'active' : ''}`} onClick={() => setMinimap(value => !value)} aria-label="Alternar minimapa"><Focus size={17} /></button></div>
        <div className="canvas-bottom-right"><button className="canvas-small-button organize-button" onClick={organize}><GitFork size={15} />Organizar mapa</button>{!properties && <button className="canvas-small-button" onClick={openProperties}><Settings2 size={16} />Propriedades</button>}</div>
        {!selectedIds.length && <div className="canvas-hint"><span>Duplo clique para editar</span><i /><kbd>Tab</kbd> filho <i /><kbd>Enter</kbd> irmão <i /><span>Espaço + arraste para navegar</span></div>}</>}
      </div>
      {properties && !presentation && <div className={`properties-presence ${panelClosing ? 'is-leaving' : ''}`}><Properties map={map} selected={selected} change={change} onOrientation={changeOrientation} select={select} upload={file => void upload(file)} remove={remove} close={closeProperties} /></div>}
    </div>
    {!presentation && <footer className="editor-footer"><span><span className="status-dot" />Só seu. Salvo localmente.</span><span>{map.nodes.length} tópicos<span>·</span>{currentLayout.nodes.length} visíveis<span>·</span>{themes[map.theme].name}</span><span>Conecte. Descubra. Ensine. <span className="footer-spark">✧</span></span></footer>}
    {presentation && presentationMode === 'guided' && <Presentation map={map} onStep={onStep} onExit={exitPresentation} />}
    {presentation && presentationMode === 'free' && <button className="free-presentation-exit" onClick={exitPresentation} aria-label="Sair da apresentação livre" title="Sair da apresentação (Esc)"><X size={16} />Sair <kbd>Esc</kbd></button>}
    <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
    {help && <Modal title="Faça as ideias fluírem" subtitle="Poucos atalhos. Mais espaço para pensar." onClose={() => setHelp(false)}><div className="shortcut-list">{[['Criar subtópico', 'Tab'], ['Criar tópico irmão', 'Enter'], ['Editar tópico', 'F2 / duplo clique'], ['Desfazer / refazer', 'Ctrl+Z / Ctrl+Shift+Z'], ['Copiar / colar ramo', 'Ctrl+C / Ctrl+V'], ['Buscar tópico', 'Ctrl+F'], ['Salvar agora', 'Ctrl+S'], ['Mover canvas', 'Espaço + arraste'], ['Sair do canvas', 'Esc'], ['Avançar na apresentação', '→ / Page Down'], ['Pausar a projeção', 'B']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><p className="modal-note">Os atalhos de tópicos funcionam no canvas, fora da edição de texto. Arraste para ajustar a composição; altere o pai no painel Estilo para reorganizar a hierarquia.</p></Modal>}
    {historyOpen && <Modal title="O caminho até aqui" subtitle="Versões recuperáveis do mapa. A versão atual será preservada antes de restaurar." onClose={() => !busy && setHistoryOpen(false)}><div className="version-list">{!revisions.length ? <p className="muted">As versões aparecem conforme você trabalha no mapa.</p> : revisions.map(revision => <div className="backup-row" key={revision.id}><Clock3 size={20} /><div><strong>{revision.title || map.title}</strong><small>{new Date(revision.createdAt).toLocaleString('pt-BR')}</small></div><button className="button subtle small" onClick={() => setRestoreRevision(revision.id)}>Restaurar</button></div>)}</div>{restoreRevision && <div className="inline-confirm"><strong>Voltar a esta versão?</strong><p>Suas alterações atuais serão salvas em um arquivo editável antes da troca.</p><button className="button subtle small" onClick={() => setRestoreRevision(null)}>Cancelar</button><button className="button primary small" disabled={busy} onClick={() => void run(async () => { await flush(); await exportRecovery(getCurrent()); reset(await api.restoreRevision(map.id, restoreRevision)); setRestoreRevision(null); setHistoryOpen(false); notify('Versão restaurada.'); })}><RotateCcw size={15} />Confirmar restauração</button></div>}</Modal>}
  </div>;
}

function Outline({ map, parentId, selectedId, select, toggle, depth = 0 }: { map: MapDocument; parentId: string | null; selectedId?: string; select: (id: string) => void; toggle: (id: string) => void; depth?: number }) {
  return <>{map.nodes.filter(node => node.parentId === parentId).map(node => { const children = map.nodes.filter(item => item.parentId === node.id); return <div key={node.id}><div className={`outline-row ${selectedId === node.id ? 'selected' : ''}`} style={{ paddingLeft: 13 + Math.min(depth, 8) * 14 }}><button className="outline-expand" aria-label={node.collapsed ? 'Expandir ramo na estrutura' : 'Recolher ramo na estrutura'} disabled={!children.length} onClick={() => toggle(node.id)}>{children.length ? node.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} /> : <Minus size={9} />}</button><button className="outline-topic" onClick={() => select(node.id)}>{node.text}</button></div>{!node.collapsed && <Outline map={map} parentId={node.id} selectedId={selectedId} select={select} toggle={toggle} depth={depth + 1} />}</div>; })}</>;
}
