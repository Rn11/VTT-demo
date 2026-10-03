import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSound } from '../lib/audio';
import { send } from '../lib/socket';
import { useGame } from '../lib/store';
import { t } from '../i18n';
import { Section, UploadButton, useAssets } from './ui';

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

export function MyVolume() {
  const { volume, setVolume, enabled, enable } = useSound();
  return (
    <div className="row">
      {!enabled && (
        <button type="button" onClick={enable}>
          🔈 {t('soundOn')}
        </button>
      )}
      <label className="inline grow">
        {t('myVolume')}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
    </div>
  );
}

export function AudioPanel() {
  const isGm = useGame((s) => s.me?.role === 'gm');
  const audio = useGame((s) => s.audio);
  const offset = useGame((s) => s.serverOffset);
  const adventureId = useGame((s) => s.adventure?.id);
  const tracks = useAssets('audio');
  const [loop, setLoop] = useState(true);
  const [sfxVolume, setSfxVolume] = useState(0.8);
  const now = useNow();

  const current = audio?.assetId ? tracks.find((a) => a.id === audio.assetId) : undefined;
  const position = audio
    ? audio.playing
      ? audio.position + (now + offset - audio.anchor) / 1000
      : audio.position
    : 0;

  if (!isGm) {
    return (
      <div className="panel">
        <Section title={t('tabAudio')}>
          <p>{audio?.assetId && audio.playing ? `🎵 ${t('musicPlaying')}` : t('nothingPlaying')}</p>
          <MyVolume />
        </Section>
      </div>
    );
  }

  return (
    <div className="panel">
      <Section title={t('tabAudio')}>
        <div className="now-playing">
          {current ? (
            <>
              <div>
                {audio?.playing ? '▶' : '⏸'} {t('nowPlaying', { name: current.name })}{' '}
                <span className="muted">{fmt(position)}</span>
              </div>
              <div className="row">
                {audio?.playing ? (
                  <button type="button" onClick={() => send({ type: 'audio.pause' })}>
                    {t('pause')}
                  </button>
                ) : (
                  <button type="button" onClick={() => send({ type: 'audio.resume' })}>
                    {t('resume')}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => send({ type: 'audio.stop' })}
                >
                  {t('stop')}
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={audio?.loop ?? true}
                    onChange={(e) => send({ type: 'audio.loop', loop: e.target.checked })}
                  />
                  {t('loop')}
                </label>
              </div>
            </>
          ) : (
            <p className="muted">{t('nothingPlaying')}</p>
          )}
          <label className="inline">
            {t('masterVolume')}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio?.volume ?? 0.6}
              onChange={(e) => send({ type: 'audio.volume', volume: Number(e.target.value) })}
            />
          </label>
          <MyVolume />
        </div>
      </Section>
      <Section
        title={t('uploadAudio')}
        actions={<UploadButton accept="audio/*" label={t('upload')} />}
      >
        {tracks.length === 0 && <p className="empty">{t('noTracks')}</p>}
        <label className="check">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />{' '}
          {t('loop')}
        </label>
        <ul className="tracks">
          {tracks.map((a) => (
            <li key={a.id} className={audio?.assetId === a.id ? 'current' : ''} data-testid="track">
              <span className="grow">{a.name}</span>
              <button
                type="button"
                title={t('play')}
                aria-label={`${t('play')}: ${a.name}`}
                onClick={() => send({ type: 'audio.play', assetId: a.id, loop })}
              >
                ▶
              </button>
              <button
                type="button"
                className="secondary"
                title={t('sfx')}
                aria-label={`${t('sfx')}: ${a.name}`}
                onClick={() => send({ type: 'sfx.play', assetId: a.id, volume: sfxVolume })}
              >
                🔔
              </button>
              <button
                type="button"
                className="icon"
                aria-label={t('delete')}
                onClick={() =>
                  adventureId &&
                  window.confirm(t('confirmDelete', { name: a.name })) &&
                  void api.del(`/api/adventures/${adventureId}/assets/${a.id}`)
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {tracks.length > 0 && (
          <label className="inline">
            🔔 {t('masterVolume')}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxVolume}
              onChange={(e) => setSfxVolume(Number(e.target.value))}
            />
          </label>
        )}
      </Section>
    </div>
  );
}
