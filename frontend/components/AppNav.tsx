'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, setAccessToken, getApiBase } from '@/lib/api';

/** Shared top navigation for the authenticated app (dashboard, chart, admin).
 *  Horizontal links on desktop; a hamburger dropdown on phones. */
export function AppNav({ active }: { active?: 'dashboard' | 'chart' | 'settings' | 'admin' }) {
  const [brand, setBrand] = useState<{ appName: string; logoUrl: string }>();
  const [role, setRole] = useState<string>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`${getApiBase()}/api/public/branding`).then((r) => r.json()).then((j) => j.ok && setBrand(j.data)).catch(() => {});
    api.get<{ role: string }>('/api/me').then((m) => setRole(m.role)).catch(() => {});
  }, []);

  async function logout() {
    await api.post('/api/auth/logout').catch(() => {});
    setAccessToken(null);
    window.location.href = '/'; // session finished → public home page
  }

  const items = [
    { href: '/dashboard', label: 'Dashboard', key: 'dashboard' },
    { href: '/chart/BTCUSDT', label: 'Charts', key: 'chart' },
    { href: '/settings', label: 'Profile', key: 'settings' },
    ...(role === 'ADMIN' ? [{ href: '/admin', label: 'Admin', key: 'admin' }] : []),
  ];
  const cls = (key: string, block = false) =>
    `${block ? 'block ' : ''}px-3 py-2 rounded text-sm whitespace-nowrap transition ${active === key ? 'bg-accent/20 text-accent' : 'text-muted hover:text-accent'}`;

  return (
    <nav className="sticky top-0 z-30 border-b border-green-900/30 bg-bg/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-accent shrink-0 min-w-0">
          {brand?.logoUrl ? <img src={brand.logoUrl} alt="" className="h-7 w-auto rounded shrink-0" /> : <span>▚</span>}
          <span className="truncate max-w-[52vw] sm:max-w-none">{brand?.appName ?? 'DS2AuraTrading AI'}</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          {items.map((i) => <Link key={i.key} href={i.href} className={cls(i.key)}>{i.label}</Link>)}
          <button onClick={logout} className="px-3 py-2 rounded text-sm whitespace-nowrap text-muted hover:text-danger transition">Logout</button>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}
          className="sm:hidden grid place-items-center h-9 w-9 shrink-0 rounded border border-green-900/40 text-accent text-lg leading-none">
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="sm:hidden border-t border-green-900/30 px-3 py-2 space-y-1">
          {items.map((i) => <Link key={i.key} href={i.href} className={cls(i.key, true)} onClick={() => setOpen(false)}>{i.label}</Link>)}
          <button onClick={logout} className="block w-full text-left px-3 py-2 rounded text-sm text-danger hover:bg-danger/10 transition">Logout</button>
        </div>
      )}
    </nav>
  );
}
