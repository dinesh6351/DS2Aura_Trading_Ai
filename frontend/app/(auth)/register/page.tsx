'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAccessToken } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', mobile: '', country: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

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
        {(['fullName', 'email', 'mobile', 'country', 'password'] as const).map((k) => (
          <input key={k} className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
            placeholder={k} type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'}
            value={form[k]} onChange={set(k)} required={k !== 'mobile' && k !== 'country'} />
        ))}
        {error && <p className="text-danger text-sm">{error}</p>}
        <button className="btn w-full" disabled={loading}>{loading ? '…' : 'Register'}</button>
        <a href="/login" className="block text-center text-muted text-sm hover:text-accent">Have an account? Sign in</a>
      </form>
    </main>
  );
}
