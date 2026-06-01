'use client';

import { useEffect, useState } from 'react';
import { BILLING, centsToUsd } from '@platform/shared';
import { Background3D, RobotMascot } from '@/components/landing3d';
import { getApiBase } from '@/lib/api';

interface Branding {
  appName: string; tagline: string; heroSubtitle: string; logoUrl: string;
  webUrl: string; appUrl: string; supportEmail: string; feedbackEmail: string;
}

const FEATURES = [
  { icon: '🤖', title: 'AI Trading Bot', body: '19-condition scoring engine trades your Binance Futures account automatically — EMA, RSI, MACD, ADX, VWAP, volume & multi-timeframe confirmation.' },
  { icon: '📊', title: 'Real-Time Dashboard', body: 'Live positions, P&L, win rate, equity curve and bot activity — streamed over WebSocket the instant anything changes.' },
  { icon: '🔔', title: 'AI Signals', body: 'See every coin scored in real time with the exact reasons a trade passed or was blocked. No black box.' },
  { icon: '🛡️', title: 'Risk Management', body: 'Break-even, trailing stop, hard SL/TP, daily caps and a margin guard protect every position — even without exchange-side stops.' },
  { icon: '🔐', title: 'Your Keys, Encrypted', body: 'Your Binance API keys are AES-256 encrypted and isolated. Trade-only — withdrawals never needed. Your funds stay on your account.' },
  { icon: '📱', title: 'Web & Mobile Ready', body: 'One responsive platform across web and PWA, with native mobile apps on the roadmap — same secure backend.' },
];

export default function Home() {
  const [b, setB] = useState<Branding | null>(null);

  useEffect(() => {
    fetch(`${getApiBase()}/api/public/branding`).then((r) => r.json())
      .then((j) => { if (j.ok) setB(j.data); }).catch(() => {});
  }, []);

  const name = b?.appName ?? 'DS2AuraTrading AI';
  const heroSub = b?.heroSubtitle ?? 'Connect your Binance Futures account, pick a risk mode, and let an AI-scored bot trade for you — fully isolated, fully yours.';
  const monthly = centsToUsd(BILLING.basicMonthlyCents);
  const overage = centsToUsd(BILLING.overagePerTradeCents);
  const proYear = centsToUsd(BILLING.proAnnualCents);

  return (
    <main className="min-h-screen aurora-bg text-slate-100">
      <Background3D />
      <RobotMascot />
      <div className="neon-grid relative z-10">
        {/* Nav */}
        <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
          <span className="flex items-center gap-2 text-xl font-extrabold">
            {b?.logoUrl
              ? <img src={b.logoUrl} alt={name} className="h-8 w-auto rounded" />
              : <span className="grad-text">▚</span>}
            <BrandName name={name} />
          </span>
          <div className="flex items-center gap-3">
            <a href="/login" className="pill pill-ghost text-sm">Sign in</a>
            <a href="/register" className="pill pill-primary text-sm">Start free trial</a>
          </div>
        </nav>

        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
          {b?.logoUrl && <img src={b.logoUrl} alt={name} className="h-20 w-auto mx-auto mb-6 rounded-xl floaty" />}
          <p className="label text-accent mb-4">Automated Crypto Trading · Binance USDT-M Futures</p>
          <h1 className="text-5xl md:text-7xl font-extrabold floaty leading-tight"><BrandName name={name} /></h1>
          <p className="mt-6 text-lg md:text-2xl text-green-200 max-w-2xl mx-auto">{b?.tagline ?? 'Automated crypto trading on your own Binance account'}</p>
          <p className="mt-4 text-base md:text-lg text-slate-200 max-w-2xl mx-auto leading-relaxed">{heroSub}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a href="/register" className="pill pill-primary">🚀 Start 30-Day Free Trial</a>
            <a href="/login" className="pill pill-ghost">Live Dashboard Login</a>
          </div>
          {/* web/app links */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
            {b?.webUrl && <a className="text-accent hover:underline" href={b.webUrl} target="_blank" rel="noreferrer">🌐 {b.webUrl.replace(/^https?:\/\//, '')}</a>}
            {b?.appUrl
              ? <a className="text-accent hover:underline" href={b.appUrl} target="_blank" rel="noreferrer">📱 Get the app</a>
              : <span className="text-muted">📱 Mobile app — coming soon</span>}
          </div>
        </section>

        {/* Services */}
        <section className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-3xl font-bold text-center grad-text mb-2">What you get</h2>
          <p className="text-center text-muted mb-10">Everything in one platform — included with your plan.</p>
          <div className="grid md:grid-cols-3 gap-6" style={{ perspective: '1200px' }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="glass2 card3d p-6">
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="text-lg font-bold text-accent">{f.title}</h3>
                <p className="text-sm text-green-200 mt-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Fee structure */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-center grad-text mb-2">Simple, transparent pricing</h2>
          <p className="text-center text-muted mb-10">No profit-sharing. No hidden fees. Cancel anytime.</p>
          <div className="grid md:grid-cols-3 gap-6" style={{ perspective: '1200px' }}>
            {/* Trial */}
            <div className="glass2 card3d p-8 text-center">
              <p className="label">Free Trial</p>
              <p className="text-5xl font-extrabold grad-text my-3">30 Days</p>
              <p className="text-muted">Full platform access. One trial per user &amp; Binance account.</p>
              <ul className="text-sm text-green-200 mt-5 space-y-2 text-left">
                <li>✅ Full bot + AI signals</li>
                <li>✅ Real-time dashboard &amp; analytics</li>
                <li>✅ No card required to start</li>
              </ul>
              <a href="/register" className="pill pill-ghost mt-6 inline-block w-full">Start free</a>
            </div>
            {/* Basic */}
            <div className="glass2 card3d neon-border p-8 text-center relative">
              <span className="absolute top-4 right-4 text-xs px-2 py-1 rounded bg-accent/20 text-accent">POPULAR</span>
              <p className="label">Basic Plan</p>
              <p className="text-5xl font-extrabold grad-text my-3">${monthly}<span className="text-lg text-muted">/mo</span></p>
              <p className="text-muted">Includes <b className="text-green-100">{BILLING.includedTrades} trades</b> / month, then <b className="text-green-100">${overage.toFixed(2)}</b> per extra trade.</p>
              <ul className="text-sm text-green-200 mt-5 space-y-2 text-left">
                <li>✅ Everything in the trial, billed monthly</li>
                <li>✅ Usage-based — pay only for what you trade</li>
                <li>✅ Live usage meter, no surprises</li>
              </ul>
              <a href="/register" className="pill pill-primary mt-6 inline-block w-full">Get started</a>
            </div>
            {/* Pro (annual) */}
            <div className="glass2 card3d grad-border p-8 text-center relative">
              <span className="absolute top-4 right-4 text-xs px-2 py-1 rounded bg-violet-500/20 text-violet-300">BEST VALUE</span>
              <p className="label">Pro Plan</p>
              <p className="text-5xl font-extrabold grad-text my-3">${proYear}<span className="text-lg text-muted">/yr</span></p>
              <p className="text-muted">{BILLING.proMonthsFree} months free vs monthly. Still <b className="text-green-100">{BILLING.includedTrades} trades</b>/month, then <b className="text-green-100">${overage.toFixed(2)}</b> per extra trade.</p>
              <ul className="text-sm text-green-200 mt-5 space-y-2 text-left">
                <li>✅ Everything in Basic, billed yearly</li>
                <li>✅ Save ${(monthly * 12 - proYear).toFixed(0)} a year ({BILLING.proMonthsFree} months free)</li>
                <li>✅ Same 150 trades/month + ${overage.toFixed(2)} overage</li>
              </ul>
              <a href="/register" className="pill pill-primary mt-6 inline-block w-full">Go Pro</a>
            </div>
          </div>
          <div className="glass2 p-5 mt-6 text-center text-sm text-green-200">
            <b className="text-accent">Examples:</b> {BILLING.includedTrades} trades = ${monthly} · 200 trades = ${(monthly + 50 * overage).toFixed(0)} · 300 trades = ${(monthly + 150 * overage).toFixed(0)}
          </div>
        </section>

        {/* Feedback */}
        <FeedbackSection email={b?.feedbackEmail} />

        {/* Footer */}
        <footer className="border-t border-green-900/30 mt-10">
          <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted">
            <span className="flex items-center gap-2 font-bold">
              {b?.logoUrl ? <img src={b.logoUrl} alt={name} className="h-6 w-auto rounded" /> : <span className="grad-text">▚</span>} <BrandName name={name} />
            </span>
            <div className="flex gap-5">
              <a href="/login" className="hover:text-accent">Sign in</a>
              <a href="/register" className="hover:text-accent">Register</a>
              {b?.webUrl && <a href={b.webUrl} className="hover:text-accent" target="_blank" rel="noreferrer">Website</a>}
              {b?.supportEmail && <a href={`mailto:${b.supportEmail}`} className="hover:text-accent">Support</a>}
            </div>
            <span>© {new Date().getFullYear()} {name}. Trading involves risk.</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

/** Renders the brand name with a jumping digit and a shimmering color-moving "AI". */
function BrandName({ name }: { name: string }) {
  const parts = name.split(/(\bAI\b|\d)/g).filter(Boolean);
  return (
    <span className="brand-base">
      {parts.map((p, i) =>
        /^\d$/.test(p) ? <span key={i} className="brand-jump">{p}</span>
          : /^AI$/i.test(p) ? <span key={i} className="brand-ai">{p}</span>
            : <span key={i}>{p}</span>,
      )}
    </span>
  );
}

function FeedbackSection({ email }: { email?: string }) {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const r = await fetch(`${getApiBase()}/api/public/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }).then((x) => x.json());
      if (r.ok) { setSent(true); setForm({ name: '', email: '', message: '' }); }
      else setErr(r.error?.message ?? 'Could not send');
    } catch { setErr('Network error'); }
  }

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center grad-text mb-2">Feedback &amp; support</h2>
      <p className="text-center text-muted mb-8">Questions or ideas? Tell us — we read everything.{email && <> Or email <a className="text-accent" href={`mailto:${email}`}>{email}</a>.</>}</p>
      {sent ? (
        <div className="glass2 p-8 text-center text-accent">✅ Thanks for your feedback — we&apos;ll be in touch.</div>
      ) : (
        <form onSubmit={submit} className="glass2 p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <input className="bg-bg/60 border border-green-900/40 rounded px-3 py-2" placeholder="Your name" value={form.name} onChange={set('name')} required />
            <input className="bg-bg/60 border border-green-900/40 rounded px-3 py-2" placeholder="Your email" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <textarea className="w-full bg-bg/60 border border-green-900/40 rounded px-3 py-2 min-h-28" placeholder="Your message…" value={form.message} onChange={set('message')} required />
          {err && <p className="text-danger text-sm">{err}</p>}
          <button className="pill pill-primary w-full">Send feedback</button>
        </form>
      )}
    </section>
  );
}
