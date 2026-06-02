'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/**
 * Gates the authenticated app. On mount it validates the session via /api/me,
 * which transparently refreshes the access token from the httpOnly cookie. If
 * there is no valid session (logged out / expired), it bounces to the public
 * home page — so pasting /dashboard, /admin or /settings while logged out never
 * renders the app shell. `requireAdmin` additionally gates on the ADMIN role.
 */
export function AuthGuard({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ok'>('checking');

  useEffect(() => {
    let alive = true;
    api.get<{ role: string }>('/api/me')
      .then((me) => {
        if (!alive) return;
        if (requireAdmin && me.role !== 'ADMIN') { router.replace('/dashboard'); return; }
        setState('ok');
      })
      .catch(() => { if (alive) router.replace('/'); });
    return () => { alive = false; };
  }, [requireAdmin, router]);

  if (state === 'checking') {
    return (
      <main className="min-h-screen grid place-items-center text-muted">
        <div className="animate-pulse text-sm">Loading…</div>
      </main>
    );
  }
  return <>{children}</>;
}
