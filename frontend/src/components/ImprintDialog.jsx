import React, { useEffect, useRef } from 'react';

export default function ImprintDialog({ onClose }) {
  const dlgRef = useRef(null);
  const prev = useRef(null);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    prev.current = document.activeElement;
    try { dlg.showModal(); } catch (_) {}
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    dlg.addEventListener('keydown', onKey);
    return () => dlg.removeEventListener('keydown', onKey);
  }, []);

  const handleClose = () => {
    try { dlgRef.current.close(); } catch (_) {}
    onClose?.();
    const el = prev.current; if (el && el.focus) setTimeout(() => el.focus(), 0);
  };

  return (
    <dialog ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby="imprint-title" className="imprint-dialog" onClick={(e) => { if (e.target === dlgRef.current) handleClose(); }}>
      <div className="imprint-modal">
        <div className="imprint-header">
          <h2 id="imprint-title">Imprint & Contact</h2>
          <button className="close-btn" onClick={handleClose} aria-label="Close">✕</button>
        </div>
        <div className="imprint-body">
          <p style={{ whiteSpace: 'pre-line', margin: 0 }}>
{`Thorben Grosser
Warschauer Platz 11-13
10245 Berlin

Thorben@thorben.co`}
          </p>
        </div>
      </div>
    </dialog>
  );
}


