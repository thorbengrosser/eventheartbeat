import React from 'react';

export default function Imprint() {
  return (
    <div style={{
      minHeight: '100vh',
      padding: 20,
      color: 'var(--text-color, #ffffff)',
      background: 'linear-gradient(135deg, var(--primary-color, #667eea) 0%, var(--secondary-color, #764ba2) 100%)',
      backgroundAttachment: 'fixed'
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 12,
        padding: 16,
        maxWidth: 540,
        margin: '40px auto',
        backdropFilter: 'blur(8px)'
      }}>
        <h1 style={{ marginTop: 0 }}>Impressum</h1>
        <p style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>
{`Thorben Grosser
Warschauer Platz 11-13
10245 Berlin

Thorben@thorben.co`}
        </p>
      </div>
    </div>
  );
}


