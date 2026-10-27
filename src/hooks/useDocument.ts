import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapDocument } from '../../shared/model.ts';
import { api, ApiError, errorMessage } from '../lib/api';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

export function useDocument(initial: MapDocument, onSaved: (map: MapDocument) => void) {
  const [document, setDocument] = useState(initial);
  const [status, setStatus] = useState<SaveState>('saved');
  const [error, setError] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const current = useRef(initial), dirty = useRef(false), failed = useRef(false), generation = useRef(0);
  const history = useRef<MapDocument[]>([]), future = useRef<MapDocument[]>([]);
  const lastHistoryKey = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), firstChange = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null), mounted = useRef(true);
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved;
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const save = useCallback(async () => {
    if (inFlight.current) { await inFlight.current; return; }
    if (!dirty.current || failed.current) return;
    const snapshot = structuredClone(current.current), version = generation.current;
    snapshot.title = snapshot.title.trim() || 'Meu mapa';
    setStatus('saving');
    const operation = api.save(snapshot).then(saved => {
      if (!mounted.current) return;
      current.current = { ...current.current, revision: saved.revision, updatedAt: saved.updatedAt };
      setDocument(current.current); onSavedRef.current(saved);
      if (version === generation.current) { dirty.current = false; firstChange.current = 0; setStatus('saved'); }
      else { setStatus('pending'); timer.current = setTimeout(() => void saveRef.current(), 150); }
      setError('');
    }).catch((cause: unknown) => {
      if (!mounted.current) return;
      failed.current = true; setStatus(cause instanceof ApiError && cause.status === 409 ? 'conflict' : 'error'); setError(errorMessage(cause));
    }).finally(() => { inFlight.current = null; });
    inFlight.current = operation; await operation;
  }, []);
  saveRef.current = save;

  const publish = useCallback((next: MapDocument, record = true, historyKey?: string) => {
    if (record) {
      if (!historyKey || lastHistoryKey.current !== historyKey) history.current = [...history.current.slice(-79), structuredClone(current.current)];
      future.current = []; lastHistoryKey.current = historyKey ?? null;
    } else lastHistoryKey.current = null;
    current.current = next; dirty.current = true; generation.current += 1;
    if (!firstChange.current) firstChange.current = Date.now();
    setDocument(next); setHistoryVersion(version => version + 1);
    if (!failed.current) {
      setStatus('pending');
      if (timer.current) clearTimeout(timer.current);
      const wait = Math.max(0, Math.min(700, 3000 - (Date.now() - firstChange.current)));
      timer.current = setTimeout(() => void saveRef.current(), wait);
    }
  }, []);

  const change = useCallback((mutate: (draft: MapDocument) => void, options?: { historyKey?: string }) => {
    const next = structuredClone(current.current); mutate(next);
    next.scenes = next.scenes.filter(scene => next.nodes.some(node => node.id === scene.nodeId));
    if (JSON.stringify(next) !== JSON.stringify(current.current)) publish(next, true, options?.historyKey);
  }, [publish]);

  const undo = useCallback(() => {
    const previous = history.current.pop(); if (!previous) return;
    future.current.push(structuredClone(current.current));
    publish({ ...previous, revision: current.current.revision, updatedAt: current.current.updatedAt }, false);
  }, [publish]);
  const redo = useCallback(() => {
    const next = future.current.pop(); if (!next) return;
    history.current.push(structuredClone(current.current));
    publish({ ...next, revision: current.current.revision, updatedAt: current.current.updatedAt }, false);
  }, [publish]);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    while (dirty.current && !failed.current) await saveRef.current();
    if (failed.current) throw new Error('Há alterações não salvas. Exporte uma cópia de recuperação antes de sair.');
    return current.current;
  }, []);
  const retry = useCallback(async () => { failed.current = false; setError(''); await saveRef.current(); }, []);
  const reset = useCallback((map: MapDocument) => {
    if (timer.current) clearTimeout(timer.current);
    current.current = map; dirty.current = false; failed.current = false; firstChange.current = 0; history.current = []; future.current = []; lastHistoryKey.current = null;
    setDocument(map); setStatus('saved'); setError(''); setHistoryVersion(version => version + 1); onSavedRef.current(map);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  return { document, change, undo, redo, flush, retry, reset, status, error, canUndo: historyVersion >= 0 && history.current.length > 0, canRedo: future.current.length > 0, getCurrent: () => current.current };
}
