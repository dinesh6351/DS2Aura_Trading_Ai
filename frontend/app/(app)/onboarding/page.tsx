'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TradingMode } from '@platform/shared';
import { api } from '@/lib/api';

/**
 * 4-step onboarding (matches the brief): account → connect Binance → pick mode →
 * activate. Step 1 is done at registration; this drives steps 2-4.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(2);
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [mode, setMode] = useState<TradingMode>(TradingMode.BALANCED);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  async function connect() {
    setError('');
    try {
      const r = await api.post<{ warning?: string }>('/api/apikeys', { apiKey, secret });
      if (r.warning) setWarning(r.warning);
      setStep(3);
    } catch (e) { setError((e as Error).message); }
  }
  async function chooseMode() { await api.post('/api/bot/mode', { mode }); setStep(4); }
  async function activate() { await api.post('/api/bot/start'); router.push('/dashboard'); }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="card w-[460px] space-y-4">
        <h1 className="text-accent text-xl font-bold">Setup · Step {step} of 4</h1>

        {step === 2 && (
          <>
            <p className="label">Connect your Binance Futures API key (trade-only, no withdrawals)</p>
            <input className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
              placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <input className="w-full bg-bg border border-green-900/40 rounded px-3 py-2"
              placeholder="Secret Key" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
            <p className="text-xs text-muted">Keys are validated against Binance then stored encrypted (AES-256). We never see withdrawals.</p>
            {error && <p className="text-danger text-sm">{error}</p>}
            <button className="btn w-full" onClick={connect}>Validate & connect</button>
          </>
        )}

        {step === 3 && (
          <>
            {warning && <p className="text-warn text-sm">⚠ {warning}</p>}
            <p className="label">Choose your trading mode</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(TradingMode).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`p-3 rounded border text-sm ${mode === m ? 'border-accent text-accent' : 'border-green-900/40 text-muted'}`}>
                  {m}
                </button>
              ))}
            </div>
            <button className="btn w-full" onClick={chooseMode}>Continue</button>
          </>
        )}

        {step === 4 && (
          <>
            <p className="label">You&apos;re ready. Activate the bot to start trading your account.</p>
            <button className="btn w-full" onClick={activate}>Activate bot →</button>
          </>
        )}
      </div>
    </main>
  );
}
