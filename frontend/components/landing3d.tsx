'use client';

import { useEffect, useMemo, useState } from 'react';

/* ─────────────── Copilot-inspired aurora background (distinct) ───────────── */

export function Background3D() {
  // No scroll/parallax state → zero React re-renders. Everything animates purely
  // on the GPU compositor (CSS transforms), so scrolling stays smooth.
  const particles = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    left: `${(i * 41 + 5) % 100}%`,
    dur: 11 + (i % 6) * 2,
    delay: -(i * 1.7) % 14,
    color: ['#22d3ee', '#4ade80', '#a78bfa'][i % 3],
  })), []);

  return (
    <div className="scene3d aurora-bg" aria-hidden>
      <div className="blob" style={{ width: '42vw', height: '42vw', top: '-8%', left: '-6%', background: '#16a34a', animation: 'blobDrift 26s ease-in-out infinite' }} />
      <div className="blob" style={{ width: '38vw', height: '38vw', top: '4%', right: '-8%', background: '#0891b2', animation: 'blobDrift 30s ease-in-out infinite' }} />
      <div className="blob" style={{ width: '40vw', height: '40vw', bottom: '-12%', left: '28%', background: '#6d28d9', animation: 'blobDrift 34s ease-in-out infinite' }} />
      {particles.map((pt, i) => (
        <span key={i} className="particle" style={{ left: pt.left, animationDuration: `${pt.dur}s`, animationDelay: `${pt.delay}s`, background: pt.color, boxShadow: `0 0 6px ${pt.color}` }} />
      ))}
    </div>
  );
}

/* ───────────── Copilot-style "visor" AI mascot (scroll-reactive) ─────────── */

type Expr = 'wave' | 'happy' | 'excited' | 'wink';
const SECTIONS: { until: number; expr: Expr; text: string; color: string }[] = [
  { until: 0.15, expr: 'wave',    text: "Hey, I'm Aura ✦",        color: '#4ade80' },
  { until: 0.40, expr: 'happy',   text: 'I trade for you ⚡',      color: '#22d3ee' },
  { until: 0.62, expr: 'excited', text: 'Bank-grade encrypted 🔒', color: '#a78bfa' },
  { until: 0.85, expr: 'happy',   text: "$10/mo — that's it 💸",   color: '#22d3ee' },
  { until: 2.00, expr: 'wink',    text: "Let's get started 🚀",    color: '#f0abfc' },
];

export function RobotMascot() {
  const [pct, setPct] = useState(0);
  const [eye, setEye] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // One rAF gate for BOTH scroll + mouse → at most one state update per frame.
    let raf = 0; let pending = false;
    let mx = 0, my = 0, hasMouse = false;
    const flush = () => {
      pending = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const np = max > 0 ? window.scrollY / max : 0;
      // only re-render when it moves enough to matter → far fewer renders while scrolling
      setPct((prev) => (Math.abs(prev - np) > 0.015 ? np : prev));
      if (hasMouse) {
        const nx = Math.round(((mx / window.innerWidth) * 2 - 1) * 100) / 100;
        const ny = Math.round(((my / window.innerHeight) * 2 - 1) * 100) / 100;
        setEye((p) => (p.x === nx && p.y === ny ? p : { x: nx, y: ny }));
      }
    };
    const schedule = () => { if (!pending) { pending = true; raf = requestAnimationFrame(flush); } };
    const onScroll = () => schedule();
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; hasMouse = true; schedule(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMove, { passive: true });
    schedule();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);

  const s = SECTIONS.find((x) => pct < x.until) ?? SECTIONS[SECTIONS.length - 1];
  const c = s.color;
  const px = Math.max(-4, Math.min(4, eye.x * 4));
  const py = Math.max(-2.5, Math.min(3, eye.y * 2.5 + pct * 2));
  const tilt = `rotateY(${eye.x * 16}deg) rotateX(${(-eye.y * 9) + pct * 6}deg)`;
  const wink = s.expr === 'wink';
  const excited = s.expr === 'excited';

  return (
    <div className="fixed bottom-5 right-5 z-20 hidden sm:flex flex-col items-end gap-2 select-none" style={{ perspective: 800 }}>
      <div className="bot-bubble px-3 py-2 text-sm max-w-[210px] text-right" style={{ color: c, borderColor: `${c}66`, boxShadow: `0 0 18px ${c}40` }}>{s.text}</div>
      <div className="bot2" style={{ width: 130, height: 150 }}>
        <div style={{ transform: tilt, transformStyle: 'preserve-3d', transition: 'transform .12s ease-out' }}>
          <svg viewBox="0 0 140 150" width="132" height="150" style={{ filter: `drop-shadow(0 0 16px ${c}88)` }}>
            <defs>
              <linearGradient id="visorG" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={c} /><stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
              <clipPath id="visorClip"><rect x="40" y="52" width="60" height="26" rx="13" /></clipPath>
            </defs>

            {/* antenna */}
            <line x1="70" y1="22" x2="70" y2="10" stroke={c} strokeWidth="3" />
            <circle cx="70" cy="9" r="5" fill={c}><animate attributeName="opacity" values="1;0.35;1" dur="1.5s" repeatCount="indefinite" /></circle>

            {/* headphone ears */}
            <rect x="18" y="50" width="12" height="34" rx="6" fill="#0b1220" stroke={c} strokeWidth="2" />
            <rect x="110" y="50" width="12" height="34" rx="6" fill="#0b1220" stroke={c} strokeWidth="2" />

            {/* head capsule */}
            <rect x="28" y="24" width="84" height="68" rx="30" fill="#0b1220" stroke="#1e293b" strokeWidth="2.5" />
            <rect x="28" y="24" width="84" height="68" rx="30" fill="none" stroke={c} strokeWidth="1.5" opacity="0.5" />

            {/* visor */}
            <rect x="40" y="52" width="60" height="26" rx="13" fill="#04070d" stroke={c} strokeWidth="2" />
            <g clipPath="url(#visorClip)">
              <rect x="40" y="52" width="60" height="26" fill="url(#visorG)" opacity="0.18" />
              {/* scanning light */}
              <rect className="visor-scan" x="64" y="52" width="10" height="26" fill={c} opacity="0.35" />
              {/* eyes / expression */}
              {excited ? (
                <>
                  <circle cx={58 + px} cy={65 + py} r="5" fill={c} />
                  <circle cx={82 + px} cy={65 + py} r="5" fill={c} />
                </>
              ) : wink ? (
                <>
                  <circle cx={58 + px} cy={65 + py} r="4" fill={c} />
                  <path d="M76 65 Q82 61 88 65" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <rect x={54 + px} y={61 + py} width="8" height="8" rx="3" fill={c} />
                  <rect x={78 + px} y={61 + py} width="8" height="8" rx="3" fill={c} />
                </>
              )}
            </g>

            {/* smile under visor when happy/excited */}
            {(s.expr === 'happy' || excited)
              ? <path d="M58 84 Q70 92 82 84" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
              : <line x1="60" y1="85" x2="80" y2="85" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />}

            {/* floating drone body */}
            <rect x="50" y="100" width="40" height="30" rx="12" fill="#0b1220" stroke={c} strokeWidth="2" opacity="0.9" />
            <circle cx="70" cy="115" r="6" fill="#04070d" stroke={c} strokeWidth="2">
              <animate attributeName="stroke-opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
            </circle>
            {/* thrusters */}
            <line x1="56" y1="132" x2="56" y2="142" stroke={c} strokeWidth="3" strokeLinecap="round" opacity="0.7">
              <animate attributeName="opacity" values="0.2;0.9;0.2" dur="0.6s" repeatCount="indefinite" />
            </line>
            <line x1="84" y1="132" x2="84" y2="142" stroke={c} strokeWidth="3" strokeLinecap="round" opacity="0.7">
              <animate attributeName="opacity" values="0.9;0.2;0.9" dur="0.6s" repeatCount="indefinite" />
            </line>
          </svg>
        </div>
      </div>
    </div>
  );
}
