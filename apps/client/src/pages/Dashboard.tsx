import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, copyText, inviteUrl, type AdventureSummary, type Gm } from '../lib/api';
import { navigate } from '../lib/router';
import { t } from '../i18n';

function AdventureRow({ a, onChange }: { a: AdventureSummary; onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  const rename = async () => {
    const name = window.prompt(t('adventureName'), a.name);
    if (!name?.trim()) return;
    await api.patch(`/api/adventures/${a.id}`, { name: name.trim() });
    onChange();
  };
  const remove = async () => {
    if (!window.confirm(t('confirmDelete', { name: a.name }))) return;
    await api.del(`/api/adventures/${a.id}`);
    onChange();
  };
  const renew = async () => {
    if (!window.confirm(t('renewInviteConfirm'))) return;
    await api.post(`/api/adventures/${a.id}/invite`);
    onChange();
  };
  return (
    <li className="card adventure" data-testid="adventure">
      <div className="grow">
        <a
          href={`/a/${a.id}`}
          className="adv-title"
          onClick={(e) => {
            e.preventDefault();
            navigate(`/a/${a.id}`);
          }}
        >
          {a.name}
        </a>
        <div className="row invite">
          <code className="invite-url" data-testid="invite-url">
            {inviteUrl(a.inviteToken)}
          </code>
          <button
            type="button"
            className="small secondary"
            onClick={() => {
              void copyText(inviteUrl(a.inviteToken));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? t('copied') : t('copyInvite')}
          </button>
          <button type="button" className="link small" onClick={() => void renew()}>
            {t('renewInvite')}
          </button>
        </div>
      </div>
      <div className="row">
        <button type="button" onClick={() => navigate(`/a/${a.id}`)}>
          {t('open')}
        </button>
        <a className="button secondary" href={`/api/adventures/${a.id}/export`} download>
          {t('export')}
        </a>
        <button type="button" className="link" onClick={() => void rename()}>
          {t('rename')}
        </button>
        <button type="button" className="link danger" onClick={() => void remove()}>
          {t('delete')}
        </button>
      </div>
    </li>
  );
}

function AddGm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/gms', { name: name.trim(), password });
      setMsg(t('gmCreated', { name: name.trim() }));
      setName('');
      setPassword('');
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  if (!open)
    return (
      <button type="button" className="link" onClick={() => setOpen(true)}>
        + {t('addGm')}
      </button>
    );
  return (
    <form className="row" onSubmit={(e) => void submit(e)}>
      <input
        placeholder={t('name')}
        aria-label={t('name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={40}
      />
      <input
        type="password"
        placeholder={`${t('password')} (${t('passwordHint')})`}
        aria-label={t('password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
      />
      <button type="submit">{t('create')}</button>
      {msg && <span className="muted">{msg}</span>}
    </form>
  );
}

export function Dashboard({ gm, onLogout }: { gm: Gm; onLogout: () => void }) {
  const [list, setList] = useState<AdventureSummary[] | null>(null);
  const [name, setName] = useState('');
  const [samples, setSamples] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .get<{ adventures: AdventureSummary[] }>('/api/adventures')
      .then((r) => setList(r.adventures))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    document.title = t('appName');
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/adventures', { name: name.trim(), samples });
      setName('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importZip = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', f, f.name);
      await api.post('/api/import', form);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const logout = async () => {
    await api.post('/api/logout');
    onLogout();
  };

  return (
    <div className="dashboard">
      <header className="topbar">
        <strong>🎲 {t('appName')}</strong>
        <span className="grow" />
        <span className="muted">{gm.name}</span>
        <button type="button" className="link" onClick={() => void logout()}>
          {t('logout')}
        </button>
      </header>
      <div className="dashboard-body">
        <h1>{t('dashboardTitle')}</h1>
        <form className="card stack" onSubmit={(e) => void create(e)}>
          <h2>{t('newAdventure')}</h2>
          <div className="row">
            <input
              className="grow"
              placeholder={t('adventureName')}
              aria-label={t('adventureName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
            <button type="submit" disabled={busy}>
              {t('create')}
            </button>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={samples}
              onChange={(e) => setSamples(e.target.checked)}
            />{' '}
            {t('withSamples')}
          </label>
        </form>
        {error && <p className="error-text">{error}</p>}
        {list === null ? (
          <p>{t('loading')}</p>
        ) : list.length === 0 ? (
          <p className="empty">{t('noAdventures')}</p>
        ) : (
          <ul className="cards">
            {list.map((a) => (
              <AdventureRow key={a.id} a={a} onChange={load} />
            ))}
          </ul>
        )}
        <div className="card stack">
          <div className="row">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {t('import')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => void importZip(e.target.files)}
            />
          </div>
          <p className="muted small">{t('importHint')}</p>
          <AddGm />
        </div>
      </div>
    </div>
  );
}
