import React, { useEffect, useRef } from 'react';

export default function QuestionsDrawer({ onClose }) {
  const dlgRef = useRef(null);
  const prevFocus = useRef(null);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    prevFocus.current = document.activeElement;
    try { dlg.showModal(); } catch (_) {}
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    dlg.addEventListener('keydown', onKey);
    return () => { dlg.removeEventListener('keydown', onKey); };
  }, []);

  const handleClose = () => {
    try { dlgRef.current.close(); } catch (_) {}
    onClose?.();
    const el = prevFocus.current;
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0);
  };

  return (
    <dialog ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby="faq-title" className="faq-dialog" onClick={(e) => { if (e.target === dlgRef.current) handleClose(); }}>
      <div className="faq-modal">
        <div className="faq-header">
          <h2 id="faq-title">Questions</h2>
          <button className="close-btn" onClick={handleClose} aria-label="Close">✕</button>
        </div>
        <div className="faq-body">
          <dl>
            <dt>What does this app do?</dt>
            <dd>It turns live check-ins into sound and motion—part data viz, part mood board.</dd>
            <dt>Is my API key stored?</dt>
            <dd>It remains in your browser. Tick “Keep my key…” to store it on this device.</dd>
            <dt>Can I preview without a key?</dt>
            <dd>Not yet—watch the demo video to see it in action.</dd>
            <dt>Will it auto-play sound?</dt>
            <dd>Sound starts after you interact and grant permission.</dd>
          </dl>
        </div>
      </div>
    </dialog>
  );
}


