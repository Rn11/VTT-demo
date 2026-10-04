import { useState, type FormEvent } from 'react';
import { api, type Gm } from '../lib/api';
import { t } from '../i18n';

export function AuthPage({ mode, onDone }: { mode: 'setup' | 'login'; onDone: (gm: Gm) => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ gm: Gm }>(mode === 'setup' ? '/api/setup' : '/api/login', {
        name: name.trim(),
        password,
      });
      onDone(r.gm);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card stack" onSubmit={(e) => void submit(e)}>
        <h1>🎲 {t('appName')}</h1>
        <h2>{mode === 'setup' ? t('setupTitle') : t('loginTitle')}</h2>
        <p className="muted">{mode === 'setup' ? t('setupHint') : t('loginHint')}</p>
        <label>
          {t('name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            autoFocus
            autoComplete="username"
          />
        </label>
        <label>
          {t('password')} {mode === 'setup' && <span className="muted">({t('passwordHint')})</span>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'setup' ? 8 : 1}
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={busy}>
          {mode === 'setup' ? t('setupSubmit') : t('login')}
        </button>
      </form>
    </div>
  );
}
