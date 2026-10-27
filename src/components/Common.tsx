import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { X, GitFork } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><span className="brand-symbol"><GitFork size={25} strokeWidth={1.8} /></span>{!compact && <span>draw<span className="brand-light">mapping</span><i /></span>}</span>;
}

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestClose = useCallback(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('drawmapping-motion') === 'reduced') { closeRef.current(); return; }
    setClosing(true); if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { closeRef.current(); setClosing(false); }, 280);
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(element => element.offsetParent !== null);
    const initialField = ref.current?.querySelector<HTMLElement>('input:not([type="file"]), textarea');
    if (initialField) initialField.focus(); else focusables()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); requestClose(); }
      if (event.key === 'Tab') {
        const items = focusables(); if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (closeTimer.current) clearTimeout(closeTimer.current); previous?.focus(); };
  }, [requestClose]);
  return <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><span className="eyebrow">SEU ESTÚDIO</span><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton label="Fechar janela" onClick={requestClose}><X size={20} /></IconButton></div>
      {children}
    </div>
  </div>;
}

export function MenuPresence({ show, children }: { show: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(show), [leaving, setLeaving] = useState(false);
  useLayoutEffect(() => {
    if (show) { setMounted(true); setLeaving(false); return; }
    setLeaving(true);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('drawmapping-motion') === 'reduced' ? 0 : 220;
    const timer = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(timer);
  }, [show]);
  return mounted ? <div className={`menu-presence ${leaving ? 'is-leaving' : ''}`} inert={leaving}>{children}</div> : null;
}

export function Loading({ label = 'Preparando seu estúdio…' }: { label?: string }) { return <div className="loading-state"><span className="loading-orbit" /><p>{label}</p></div>; }
