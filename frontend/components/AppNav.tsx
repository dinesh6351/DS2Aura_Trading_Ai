'use client';

import { useEffect, useState } from 'react';
import { api, setAccessToken, getApiBase } from '@/lib/api';

/** Shared top navigation for the authenticated app (dashboard, chart, admin). */
export function AppNav({ active }: { active?: 'dashboard' | 'chart' | 'settings' | 'admin' }) {
  const [brand, setBrand] = useState<{ appName: string; logoUrl: string }>();
  const [role, setRole] = useState<string>();

  useEffect(() => {
    fetch(`${getApiBase()}/api/public/branding`).then((r) => r.json()).then((j) => j.ok && setBrand(j.data)).catch(() => {});
    api.get<{ role: string }>('/api/me').then((m) => setRole(m.role)).catch(() => {});
  }, []);

  async function logout() {
    await api.post('/api/auth/logout').catch(() => {});
    setAccessToken(null);
    window.location.href = '/login';
  }

  const link = (href: string, label: string, key: string) => (
    <a href={href} className={`px-2 sm:px-3 py-1.5 rounded text-sm whitespace-nowrap transition ${active === key ? 'bg-accent/20 text-accent' : 'text-muted hover:text-accent'}`}>{label}</a>
  );

  return (
    <nav className="sticky top-0 z-30 border-b border-green-900/30 bg-bg/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-4 py-3">
        <a href="/dashboard" className="flex items-center gap-2 font-bold text-accent shrink-0">
          {brand?.logoUrl ? <img src={brand.logoUrl} alt="" className="h-7 w-auto rounded" /> : <span>▚</span>}
          <span className="hidden sm:inline">{brand?.appName ?? 'DS2AuraTrading AI'}</span>
        </a>
        <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto">
          {link('/dashboard', 'Dashboard', 'dashboard')}
          {link('/chart/BTCUSDT', 'Charts', 'chart')}
          {link('/settings', 'Profile', 'settings')}
          {role === 'ADMIN' && link('/admin', 'Admin', 'admin')}
          <button onClick={logout} className="px-2 sm:px-3 py-1.5 rounded text-sm whitespace-nowrap text-muted hover:text-danger transition">Logout</button>
        </div>
      </div>
    </nav>
  );
}
