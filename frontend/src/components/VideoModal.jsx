import React, { useEffect, useRef, useState } from 'react';

export default function VideoModal({ onClose, videos, initialId }) {
  const dlgRef = useRef(null);
  const triggerReturnRef = useRef(null);
  const [active, setActive] = useState(() => initialId || (videos && videos[0]?.id));
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Open dialog and set up focus trap
    const dlg = dlgRef.current;
    if (!dlg) return;
    try { dlg.showModal(); } catch (_) {}
    const previouslyFocused = document.activeElement;
    triggerReturnRef.current = previouslyFocused;
    setMounted(true);
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    dlg.addEventListener('keydown', onKey);
    return () => {
      dlg.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleClose = () => {
    // Unmount video by toggling mounted; then close and restore focus
    setMounted(false);
    const dlg = dlgRef.current;
    try { dlg.close(); } catch (_) {}
    onClose?.();
    const el = triggerReturnRef.current;
    if (el && typeof el.focus === 'function') {
      setTimeout(() => el.focus(), 0);
    }
  };

  const activeVideo = Array.isArray(videos) ? videos.find(v => v.id === active) : null;

  return (
    <dialog ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby="video-title" className="video-dialog" onClick={(e) => { if (e.target === dlgRef.current) handleClose(); }}>
      <div className="video-modal">
        <div className="video-header">
          <h2 id="video-title">{activeVideo?.title || 'Demo'}</h2>
          <button className="close-btn" onClick={handleClose} aria-label="Close video">✕</button>
        </div>
        <div className="video-body">
          {mounted && activeVideo ? (
            <VideoPlayer item={activeVideo} reduced={prefersReducedMotion} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '16/9', background: '#111' }} />
          )}
          {Array.isArray(videos) && videos.length > 1 && (
            <div className="video-thumbs" role="list">
              {videos.map(v => (
                <button key={v.id} role="listitem" className={`thumb ${v.id === active ? 'active' : ''}`} onClick={() => setActive(v.id)} aria-label={`Play ${v.title}`}>
                  <img src={v.thumbnail} alt={`${v.title} thumbnail`} />
                  <span>{v.durationLabel || ''}</span>
                </button>
              ))}
            </div>
          )}
          {activeVideo?.src ? (
            <p style={{ marginTop: 8 }}>
              <a href={activeVideo.src} target="_blank" rel="noopener">Open video in new tab</a>
            </p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    try { mq.addEventListener('change', onChange); } catch (_) { mq.addListener(onChange); }
    return () => { try { mq.removeEventListener('change', onChange); } catch (_) { mq.removeListener(onChange); } };
  }, []);
  return reduced;
}

function VideoPlayer({ item, reduced }) {
  if (reduced) {
    return (
      <div className="video-poster" style={{ position: 'relative' }}>
        <img src={item.thumbnail} alt={item.title + ' poster'} style={{ width: '100%', height: 'auto' }} />
        <div className="poster-overlay">
          <span>Play</span>
        </div>
      </div>
    );
  }
  if (item.provider === 'youtube') {
    const url = item.src.includes('youtube-nocookie.com') ? item.src : item.src.replace('www.youtube.com', 'www.youtube-nocookie.com');
    return (
      <iframe
        title={item.title}
        src={url}
        width="100%"
        style={{ aspectRatio: '16/9', border: 0 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }
  if (item.provider === 'vimeo') {
    return (
      <iframe
        title={item.title}
        src={item.src}
        width="100%"
        style={{ aspectRatio: '16/9', border: 0 }}
        allow="autoplay; fullscreen; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }
  // mp4
  return (
    <video controls style={{ width: '100%', height: 'auto' }} poster={item.thumbnail}>
      <source src={item.src} type="video/mp4" />
    </video>
  );
}


