'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAccessToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post<{ user: { role: string }; accessToken: string }>(
        '/api/auth/login', { email, password, totp: totp || undefined });
      setAccessToken(data.accessToken);
      router.push(data.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('2FA')) setNeeds2fa(true);
      setError(msg);
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <form onSubmit={submit} className="card w-[360px] space-y-4">
        <h1 className="text-accent text-xl font-bold">▚ Claude Trading</h1>
        <p className="label">Sign in to your account</p>
        <input className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
          placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
          placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {needs2fa && (
          <input className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
            placeholder="2FA code" value={totp} onChange={(e) => setTotp(e.target.value)} />
        )}
        {error && <p className="text-danger text-sm">{error}</p>}
        <button className="btn w-full" disabled={loading}>{loading ? '…' : 'Sign in'}</button>
        <a href="/register" className="block text-center text-muted text-sm hover:text-accent">Create account</a>
      </form>
    </main>
  );
}
