'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, Menu, X, LayoutDashboard, LineChart, UserCog, ShieldCheck } from 'lucide-react';
import { api, setAccessToken, getApiBase } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';

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
    window.location.href = '/'; 
  }

  const items = [
    { href: '/dashboard', label: 'Dashboard', key: 'dashboard', icon: LayoutDashboard },
    { href: '/chart/BTCUSDT', label: 'Charts', key: 'chart', icon: LineChart },
    { href: '/settings', label: 'Profile', key: 'settings', icon: UserCog },
    ...(role === 'ADMIN' ? [{ href: '/admin', label: 'Admin', key: 'admin', icon: ShieldCheck }] : []),
  ];
  
  const cls = (key: string, block = false) =>
    `${block ? 'flex w-full ' : 'inline-flex '} items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
      active === key ? 'bg-accent/15 text-accent shadow-sm' : 'text-muted hover:text-fg hover:bg-surface2/80'
    }`;

  return (
    <nav className="glass-header">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 h-16">
        <Link href="/dashboard" className="flex items-center gap-3 font-bold text-fg shrink-0 min-w-0 group">
          {brand?.logoUrl
            ? <img src={brand.logoUrl} alt="" className="h-8 w-auto rounded-lg shrink-0 group-hover:scale-105 transition-transform" />
            : <span className="grid place-items-center h-8 w-8 rounded-xl bg-gradient-to-br from-accent to-emerald-700 text-white shadow-md text-sm font-black group-hover:scale-105 transition-transform">A</span>}
          <span className="truncate max-w-[45vw] sm:max-w-none tracking-tight text-lg">{brand?.appName ?? 'DS2AuraTrading AI'}</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-2">
          {items.map((i) => {
            const Icon = i.icon;
            return (
              <Link key={i.key} href={i.href} className={cls(i.key)}>
                <Icon size={16} strokeWidth={active === i.key ? 2.5 : 2} /> {i.label}
              </Link>
            );
          })}
          <div className="mx-2 h-6 w-px bg-border/80" />
          <ThemeToggle />
          <button onClick={logout} className="ml-1 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-muted hover:text-danger hover:bg-danger/10 transition-colors">
            <LogOut size={16} /> Logout
          </button>
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-3 sm:hidden">
          <ThemeToggle />
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}
            className="grid place-items-center h-10 w-10 shrink-0 rounded-xl bg-surface/50 border border-border text-fg active:scale-95 transition-transform">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="sm:hidden border-t border-white/10 bg-surface/95 backdrop-blur-xl px-4 py-3 space-y-1.5 shadow-pop absolute w-full">
          {items.map((i) => {
            const Icon = i.icon;
            return (
              <Link key={i.key} href={i.href} className={cls(i.key, true)} onClick={() => setOpen(false)}>
                <Icon size={18} /> {i.label}
              </Link>
            );
          })}
          <div className="h-px w-full bg-border/50 my-2" />
          <button onClick={logout} className="flex w-full items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-danger hover:bg-danger/10 transition-colors">
            <LogOut size={18} /> Logout
          </button>
        </div>
      )}
    </nav>
  );
}
