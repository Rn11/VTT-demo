import { useEffect, useState } from 'react';
import { api, copyText, inviteUrl } from '../lib/api';
import { startAudio, useSound } from '../lib/audio';
import { navigate } from '../lib/router';
import { socket, send } from '../lib/socket';
import { useGame } from '../lib/store';
import { t, type TextKey } from '../i18n';
import { MapView } from '../components/MapView';
import { LogPanel } from '../components/LogPanel';
import { HandoutsPanel } from '../components/HandoutsPanel';
import { CharactersPanel } from '../components/CharactersPanel';
import { AudioPanel } from '../components/AudioPanel';
import { ScenePanel } from '../components/ScenePanel';
import { NotesPanel } from '../components/NotesPanel';
import { PlayersPanel } from '../components/PlayersPanel';

type Tab = 'log' | 'handouts' | 'characters' | 'audio' | 'scene' | 'notes' | 'players';

const TABS: { id: Tab; label: TextKey; icon: string; gmOnly?: boolean }[] = [
  { id: 'log', label: 'tabLog', icon: '📜' },
  { id: 'handouts', label: 'tabHandouts', icon: '✉️' },
  { id: 'characters', label: 'tabCharacters', icon: '🛡️' },
  { id: 'audio', label: 'tabAudio', icon: '🎵' },
  { id: 'scene', label: 'tabScene', icon: '🗺️', gmOnly: true },
  { id: 'notes', label: 'tabNotes', icon: '📝', gmOnly: true },
  { id: 'players', label: 'tabPlayers', icon: '👥', gmOnly: true },
];

function Errors() {
  const errors = useGame((s) => s.errors);
  const dismiss = useGame((s) => s.dismissError);
  useEffect(() => {
    if (errors.length === 0) return;
    const id = errors[0]!.id;
    const timer = setTimeout(() => dismiss(id), 5000);
    return () => clearTimeout(timer);
  }, [errors, dismiss]);
  return (
    <div className="toasts">
      {errors.map((e) => (
        <div key={e.id} className="toast error" role="alert" onClick={() => dismiss(e.id)}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

function SoundButton() {
  const { enabled, blocked, enable } = useSound();
  const playing = useGame((s) => Boolean(s.audio?.playing && s.audio.assetId));
  if (enabled && !blocked) return null;
  return (
    <button
      type="button"
      className={playing ? 'attention' : 'secondary'}
      onClick={enable}
      title={t('soundOnHint')}
    >
      🔈 {t('soundOn')}
    </button>
  );
}

function TopBar() {
  const adventure = useGame((s) => s.adventure);
  const me = useGame((s) => s.me);
  const players = useGame((s) => s.players);
  const online = useGame((s) => s.online);
  const scenes = useGame((s) => s.scenes);
  const viewSceneId = useGame((s) => s.viewSceneId);
  const status = useGame((s) => s.status);
  const [copied, setCopied] = useState(false);
  const isGm = me?.role === 'gm';
  const active = adventure?.activeSceneId ? scenes[adventure.activeSceneId] : undefined;
  const viewing = viewSceneId ? scenes[viewSceneId] : undefined;

  return (
    <header className="topbar">
      {isGm && (
        <button type="button" className="link" onClick={() => navigate('/')}>
          ← {t('back')}
        </button>
      )}
      <strong className="adv-name">{adventure?.name}</strong>
      {isGm ? (
        <span className="scene-info">
          {viewing && viewing.id !== active?.id && (
            <span className="badge warn">{t('viewing', { name: viewing.name })}</span>
          )}
          {active && <span className="muted">{t('playersSee', { name: active.name })}</span>}
          {viewing && viewing.id !== active?.id && (
            <button
              type="button"
              className="small"
              onClick={() => send({ type: 'scene.activate', id: viewing.id })}
            >
              {t('showToPlayers')}
            </button>
          )}
        </span>
      ) : (
        <span className="muted">{active?.name}</span>
      )}
      <span className="grow" />
      {status === 'offline' && <span className="badge warn">{t('offline')}</span>}
      <ul className="presence" aria-label="Spieler">
        <li
          className={online.includes('gm') ? 'on' : 'off'}
          title={`${t('gm')} – ${online.includes('gm') ? t('online') : t('offlineShort')}`}
        >
          <span className="dot" style={{ background: '#c9a0ff' }} /> {t('gm')}
        </li>
        {Object.values(players).map((p) => (
          <li
            key={p.id}
            className={online.includes(p.id) ? 'on' : 'off'}
            title={online.includes(p.id) ? t('online') : t('offlineShort')}
          >
            <span className="dot" style={{ background: p.color }} /> {p.name}
            {me?.playerId === p.id ? ' (du)' : ''}
          </li>
        ))}
      </ul>
      <SoundButton />
      {isGm && adventure?.inviteToken && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            void copyText(inviteUrl(adventure.inviteToken!));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          🔗 {copied ? t('copied') : t('copyInvite')}
        </button>
      )}
    </header>
  );
}

function Sidebar() {
  const isGm = useGame((s) => s.me?.role === 'gm');
  const unseen = useGame((s) => s.unseenHandouts.length);
  const [tab, setTab] = useState<Tab>('log');
  const tabs = TABS.filter((x) => isGm || !x.gmOnly);
  return (
    <aside className="sidebar">
      <nav className="tabs" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={tab === x.id ? 'active' : ''}
            onClick={() => setTab(x.id)}
          >
            <span className="tab-icon" aria-hidden="true">
              {x.icon}
            </span>
            <span className="tab-label">{t(x.label)}</span>
            {x.id === 'handouts' && unseen > 0 && tab !== 'handouts' && (
              <span className="badge">{unseen}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'log' && <LogPanel />}
        {tab === 'handouts' && <HandoutsPanel />}
        {tab === 'characters' && <CharactersPanel />}
        {tab === 'audio' && <AudioPanel />}
        {tab === 'scene' && isGm && <ScenePanel />}
        {tab === 'notes' && isGm && <NotesPanel />}
        {tab === 'players' && isGm && <PlayersPanel />}
      </div>
    </aside>
  );
}

export function TablePage({ adventureId }: { adventureId: string }) {
  const status = useGame((s) => s.status);
  const name = useGame((s) => s.adventure?.name);
  const [access, setAccess] = useState<'checking' | 'ok' | 'denied'>('checking');

  useEffect(() => {
    let alive = true;
    void api
      .get<{ role: string | null }>(`/api/adventures/${adventureId}/access`)
      .then((r) => alive && setAccess(r.role ? 'ok' : 'denied'))
      .catch(() => alive && setAccess('denied'));
    return () => {
      alive = false;
    };
  }, [adventureId]);

  useEffect(() => {
    if (access !== 'ok') return;
    useGame.getState().reset();
    socket.connect(adventureId);
    const stopAudio = startAudio();
    return () => {
      socket.disconnect();
      stopAudio();
      useGame.getState().reset();
    };
  }, [access, adventureId]);

  useEffect(() => {
    document.title = name ? `${name} – ${t('appName')}` : t('appName');
  }, [name]);

  if (access === 'denied' || status === 'denied')
    return <div className="center-msg">{t('noAccess')}</div>;
  if (status === 'gone') return <div className="center-msg">{t('adventureGone')}</div>;
  if (status === 'kicked') return <div className="center-msg">{t('kicked')}</div>;
  if (access === 'checking' || status === 'idle' || status === 'connecting')
    return <div className="center-msg">{t('connecting')}</div>;

  return (
    <div className="table">
      <TopBar />
      <main className="table-main">
        <MapView />
        <Sidebar />
      </main>
      <Errors />
    </div>
  );
}
