import React, { useState, useEffect, useRef } from 'react';
import './BubbleAnimation.css';

const MAX_BUBBLES = 12;
const BUBBLE_LIFETIME = 30000; // 30 seconds (longer display)

function BubbleAnimation({ message, onBubbleComplete, soundEnabled }) {
  const [bubbles, setBubbles] = useState([]);
  const soundRef = useRef(null);
  const audioContextRef = useRef(null);
  const messageQueueRef = useRef([]);
  const processingRef = useRef(false);

  useEffect(() => {
    // Handle both string messages and message objects
    const messageText = typeof message === 'string' ? message : (message?.text || null);
    
    if (messageText) {
      // Use a small delay to batch rapid messages, but ensure all are processed
      const messageId = message?.id || (Date.now() + Math.random());
      const eventType = message?.event_type || 'checkin'; // Default to checkin
      messageQueueRef.current.push({
        message: messageText,
        id: messageId,
        timestamp: message?.timestamp || Date.now(),
        eventType: eventType
      });
      
      // Process queue with a small stagger to handle rapid messages
      setTimeout(() => {
        processMessageQueue();
      }, 50); // Small delay to batch rapid messages
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  const processMessageQueue = () => {
    if (processingRef.current) {
      return; // Already processing
    }
    
    if (messageQueueRef.current.length === 0) {
      return; // Nothing to process
    }
    
    processingRef.current = true;
    
    // Process messages with a small stagger to avoid overwhelming the UI
    const processNext = () => {
      if (messageQueueRef.current.length > 0) {
        const msgData = messageQueueRef.current.shift();
        addBubble(msgData.message, msgData.eventType);
        
        // Process next message after a short delay
        setTimeout(processNext, 100); // 100ms between bubbles
      } else {
        processingRef.current = false;
      }
    };
    
    processNext();
  };

  const getOrCreateAudioContext = () => {
    if (typeof window === 'undefined') return null;
    if (window.__heartbeatAudioContext && window.__heartbeatAudioContext.state !== 'closed') {
      return window.__heartbeatAudioContext;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      window.__heartbeatAudioContext = ctx;
      return ctx;
    } catch (_e) {
      return null;
    }
  };

  const playPopSound = async () => {
    if (!soundEnabled) return;
    try {
      const audioContext = audioContextRef.current || getOrCreateAudioContext();
      if (!audioContext) throw new Error('NoAudioContext');
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch (_e) {}
      }
      // Create a short pop sound using oscillators
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      // Generate a pop sound (quick frequency sweep)
      const now = audioContext.currentTime;
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.1);
      gainNode.gain.setValueAtTime(0.25, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
    } catch (e) {
      // Fallback to file-based audio if Web Audio API fails
      try {
        if (!soundRef.current) {
          soundRef.current = new Audio('/bubble-pop.mp3');
          soundRef.current.volume = 0.3;
        }
        soundRef.current.currentTime = 0;
        soundRef.current.play().catch(() => {
          // Silently fail if sound can't be played
        });
      } catch (err) {
        // No sound available
        console.log('Sound unavailable');
      }
    }
  };

  const addBubble = (msg, eventType = 'checkin') => {
    const id = Date.now() + Math.random();
    // Darker colors with better contrast for white text
    const colors = [
      '#1a4d8c', // Dark blue
      '#6b3fa0', // Purple
      '#8b2252', // Dark pink
      '#1e7a5e', // Teal
      '#c05621', // Orange-brown
      '#2d5016', // Dark green
      '#7c2d2d', // Dark red
      '#853d0d', // Brown
      '#1e3a5f', // Navy
      '#4a148c', // Deep purple
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Random horizontal position
    const leftPosition = Math.random() * 80 + 10; // 10% to 90%

    // Assign a stable animation variant to avoid nth-child animation resets
    const variantClass = Math.random() < 0.5 ? 'bubble-left' : 'bubble-right';

    setBubbles((prev) => {
      const newBubbles = [...prev, { id, message: msg, color: randomColor, left: leftPosition, eventType, variantClass }];
      
      // Limit number of bubbles
      if (newBubbles.length > MAX_BUBBLES) {
        return newBubbles.slice(-MAX_BUBBLES);
      }
      
      return newBubbles;
    });

    // Play sound if enabled
    playPopSound();

    // Remove bubble after lifetime
    setTimeout(() => {
      setBubbles((prev) => prev.filter((b) => b.id !== id));
      if (onBubbleComplete) {
        onBubbleComplete(id);
      }
    }, BUBBLE_LIFETIME);
  };

  return (
    <div className="bubble-container">
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className={`bubble ${bubble.variantClass}`}
          style={{
            '--bubble-color': bubble.color,
            left: `${bubble.left}%`,
          }}
        >
          <div className="bubble-content">
            <span className="bubble-symbol" aria-hidden="true">✓</span>
            {bubble.message}
          </div>
        </div>
      ))}
    </div>
  );
}

export default BubbleAnimation;

