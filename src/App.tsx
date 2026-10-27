import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X, RotateCcw } from 'lucide-react';
import type { MapDocument } from '../shared/model.ts';
import { api, errorMessage } from './lib/api';
import { Library } from './components/Library';
import { Editor } from './components/Editor';
import { Loading, Logo } from './components/Common';

export function App() {
  const [maps, setMaps] = useState<MapDocument[]>([]);
  const [active, setActive] = useState<MapDocument | null>(null);
  const [loading, setLoading] = useState(true), [failure, setFailure] = useState('');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const refresh = useCallback(async () => {
    setFailure('');
    try { setMaps(await api.maps()); } catch (error) { setFailure(errorMessage(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.error ? 9000 : 4500); return () => clearTimeout(timer); }, [toast]);
  const updateSaved = useCallback((map: MapDocument) => setMaps(previous => previous.map(item => item.id === map.id ? map : item)), []);
  const open = async (map: MapDocument) => { try { setActive(await api.map(map.id)); } catch (error) { notify(errorMessage(error), true); } };

  return <>
    {loading ? <div className="startup"><Logo /><Loading /></div> : failure ? <main className="connection-error"><Logo /><AlertCircle size={42} /><h1>O estúdio precisa se reconectar</h1><p>{failure}</p><p>Confirme que a janela do servidor está aberta.</p><button className="button primary" onClick={() => { setLoading(true); void refresh(); }}><RotateCcw size={17} />Tentar novamente</button></main> : active ?
      <Editor key={active.id} initial={active} onSaved={updateSaved} onClose={async map => { updateSaved(map); setActive(null); await refresh(); }} notify={notify} /> :
      <Library maps={maps} refresh={refresh} open={open} onCreated={map => { setMaps(previous => [map, ...previous]); setActive(map); }} notify={notify} />}
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<span>{toast.text}</span><button className="toast-close" aria-label="Fechar aviso" onClick={() => setToast(null)}><X size={16} /></button></div>}
  </>;
}
