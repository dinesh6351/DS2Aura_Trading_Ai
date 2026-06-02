'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { REGIONS, REGION_TZS } from '@platform/shared';
import { api, setAccessToken } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', mobile: '', country: '', password: '', timezone: 'UTC' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  // Pre-select the visitor's region if we recognise their browser timezone.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (REGION_TZS.has(tz)) setForm((f) => ({ ...f, timezone: tz }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post<{ accessToken: string }>('/api/auth/register', form);
      setAccessToken(data.accessToken);
      router.push('/onboarding');
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <form onSubmit={submit} className="card w-[400px] space-y-3">
        <h1 className="text-accent text-xl font-bold">Create your account</h1>
        {(['fullName', 'email', 'mobile', 'country'] as const).map((k) => (
          <input key={k} className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
            placeholder={k} type={k === 'email' ? 'email' : 'text'}
            value={form[k]} onChange={set(k)} required={k !== 'mobile' && k !== 'country'} />
        ))}
        <label className="block">
          <span className="text-muted text-xs">Region — resets your daily limits &amp; today&apos;s P&amp;L at your local midnight</span>
          <select className="w-full bg-bg border border-green-900/40 rounded px-3 py-2 mt-1 text-sm" value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {REGIONS.map((r) => <option key={r.tz} value={r.tz}>{r.label}</option>)}
          </select>
        </label>
        <input className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
          placeholder="password" type="password" value={form.password} onChange={set('password')} required />
        {error && <p className="text-danger text-sm">{error}</p>}
        <button className="btn w-full" disabled={loading}>{loading ? '…' : 'Register'}</button>
        <a href="/login" className="block text-center text-muted text-sm hover:text-accent">Have an account? Sign in</a>
      </form>
    </main>
  );
}
