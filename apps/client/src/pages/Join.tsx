import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { t } from '../i18n';

interface Invite {
  adventureId: string;
  adventureName: string;
  playerName: string | null;
}

export function JoinPage({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Invite>(`/api/join/${encodeURIComponent(token)}`)
      .then((r) => {
        setInvite(r);
        setName(r.playerName ?? '');
      })
      .catch(() => setInvalid(true));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ adventureId: string }>(`/api/join/${encodeURIComponent(token)}`, {
        name: name.trim(),
      });
      navigate(`/a/${r.adventureId}`, true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (invalid) return <div className="center-msg">{t('inviteInvalid')}</div>;
  if (!invite) return <div className="center-msg">{t('loading')}</div>;

  return (
    <div className="auth">
      <form className="card stack" onSubmit={(e) => void submit(e)}>
        <h1>🎲 {t('joinTitle', { name: invite.adventureName })}</h1>
        <p className="muted">{t('joinHint')}</p>
        <label>
          {t('yourName')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            autoFocus
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit">
          {invite.playerName && name === invite.playerName ? t('rejoin', { name }) : t('join')}
        </button>
      </form>
    </div>
  );
}
