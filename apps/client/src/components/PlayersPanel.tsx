import { useEffect, useState } from 'react';
import type { Player } from '@vtt/shared';
import { api, copyText, inviteUrl } from '../lib/api';
import { send } from '../lib/socket';
import { shownSceneId, useGame } from '../lib/store';
import { t } from '../i18n';
import { Section } from './ui';

function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
  ];
}

function PlayerCard({ p }: { p: Player }) {
  const online = useGame((s) => s.online.includes(p.id));
  const adventureId = useGame((s) => s.adventure?.id);
  const characters = Object.values(useGame((s) => s.characters));
  const sceneId = useGame(shownSceneId);
  const tokens = Object.values(useGame((s) => s.tokens)).filter((x) => x.sceneId === sceneId);
  const [name, setName] = useState(p.name);
  const [copied, markCopied] = useCopied();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(p.name), [p.name]);

  const own = characters.filter((c) => c.ownerPlayerId === p.id);
  const free = characters.filter((c) => c.ownerPlayerId !== p.id);
  const ownTokens = tokens.filter((x) => x.ownerPlayerId === p.id);
  const otherTokens = tokens.filter((x) => x.ownerPlayerId !== p.id);

  const rename = () => {
    const n = name.trim();
    if (n && n !== p.name) send({ type: 'player.update', id: p.id, name: n });
    else setName(p.name);
  };

  const personalLink = async () => {
    if (!adventureId) return;
    setError(null);
    try {
      const r = await api.post<{ path: string }>(
        `/api/adventures/${adventureId}/players/${p.id}/link`,
      );
      await copyText(`${location.origin}${r.path}`);
      markCopied();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <li className="card player-card" data-testid="player-card">
      <div className="row player-head">
        <span
          className={`dot${online ? ' on' : ''}`}
          style={{ background: p.color }}
          title={online ? t('online') : t('offlineShort')}
        />
        <input
          className="title-input grow"
          aria-label={t('playerName')}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <input
          type="color"
          aria-label={t('playerColor')}
          value={p.color}
          onChange={(e) => send({ type: 'player.update', id: p.id, color: e.target.value })}
        />
      </div>

      <div className="assign">
        <span className="assign-label">{t('characters')}</span>
        <span className="chips">
          {own.length === 0 && <span className="muted">{t('nothingAssigned')}</span>}
          {own.map((c) => (
            <span key={c.id} className="chip">
              {c.name}
              <button
                type="button"
                className="icon"
                aria-label={`${t('unassign')}: ${c.name}`}
                onClick={() => send({ type: 'character.update', id: c.id, ownerPlayerId: null })}
              >
                ✕
              </button>
            </span>
          ))}
        </span>
        {free.length > 0 && (
          <select
            aria-label={t('assignCharacter')}
            value=""
            onChange={(e) =>
              e.target.value &&
              send({ type: 'character.update', id: e.target.value, ownerPlayerId: p.id })
            }
          >
            <option value="">{t('assignCharacter')}</option>
            {free.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="assign">
        <span className="assign-label">{t('tokensOfPlayer')}</span>
        <span className="chips">
          {ownTokens.length === 0 && <span className="muted">{t('nothingAssigned')}</span>}
          {ownTokens.map((x) => (
            <span key={x.id} className="chip">
              {x.name || '?'}
              <button
                type="button"
                className="icon"
                aria-label={`${t('unassign')}: ${x.name}`}
                onClick={() => send({ type: 'token.update', id: x.id, ownerPlayerId: null })}
              >
                ✕
              </button>
            </span>
          ))}
        </span>
        {otherTokens.length > 0 && (
          <select
            aria-label={t('assignToken')}
            value=""
            onChange={(e) =>
              e.target.value &&
              send({ type: 'token.update', id: e.target.value, ownerPlayerId: p.id })
            }
          >
            <option value="">{t('assignToken')}</option>
            {otherTokens.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name || '?'}
                {x.hidden ? ' (versteckt)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="row end">
        <button
          type="button"
          className="secondary small"
          onClick={() => void personalLink()}
          title={t('personalLinkHint')}
        >
          🔗 {copied ? t('copied') : t('personalLink')}
        </button>
        <button
          type="button"
          className="secondary small danger"
          onClick={() =>
            window.confirm(t('removePlayerConfirm', { name: p.name })) &&
            send({ type: 'player.remove', id: p.id })
          }
        >
          {t('removePlayer')}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </li>
  );
}

export function PlayersPanel() {
  const players = Object.values(useGame((s) => s.players));
  const invite = useGame((s) => s.adventure?.inviteToken);
  const [copied, markCopied] = useCopied();
  return (
    <div className="panel">
      <Section title={t('invitePlayers')}>
        <p className="muted small">{t('inviteHint')}</p>
        {invite && (
          <div className="row">
            <code className="invite-url grow">{inviteUrl(invite)}</code>
            <button
              type="button"
              className="small"
              onClick={() => {
                void copyText(inviteUrl(invite));
                markCopied();
              }}
            >
              {copied ? t('copied') : t('copyInvite')}
            </button>
          </div>
        )}
      </Section>
      <Section title={t('playersTitle')}>
        {players.length === 0 && <p className="empty">{t('noPlayers')}</p>}
        <ul className="cards">
          {players.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </ul>
      </Section>
    </div>
  );
}
