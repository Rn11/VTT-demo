import { useEffect, useState, type FormEvent } from 'react';
import type { Token } from '@vtt/shared';
import { PLAYER_COLORS } from '@vtt/shared/constants';
import { api, assetUrl } from '../lib/api';
import { send } from '../lib/socket';
import { useGame } from '../lib/store';
import { t } from '../i18n';
import { mapCenter } from './MapView';
import { ImagePicker, Section, UploadButton, confirmDelete, useAssets } from './ui';

function Scenes() {
  const scenes = Object.values(useGame((s) => s.scenes)).sort((a, b) => a.sort - b.sort);
  const activeId = useGame((s) => s.adventure?.activeSceneId);
  const viewId = useGame((s) => s.viewSceneId);
  const [name, setName] = useState('');

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    send({ type: 'scene.create', name: name.trim() });
    setName('');
  };

  return (
    <Section title={t('scenes')}>
      <ul className="scene-list">
        {scenes.map((s) => (
          <li key={s.id} className={s.id === viewId ? 'selected' : ''}>
            <button
              type="button"
              className="link grow left"
              onClick={() => useGame.getState().setViewScene(s.id)}
            >
              {s.name}
            </button>
            {s.id === activeId ? (
              <span className="badge">{t('active')}</span>
            ) : (
              <button
                type="button"
                className="small"
                onClick={() => send({ type: 'scene.activate', id: s.id })}
              >
                {t('showToPlayers')}
              </button>
            )}
            <button
              type="button"
              className="icon"
              aria-label={t('rename')}
              onClick={() => {
                const n = window.prompt(t('sceneName'), s.name);
                if (n?.trim()) send({ type: 'scene.update', id: s.id, name: n.trim() });
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className="icon"
              aria-label={t('delete')}
              onClick={() => confirmDelete(s.name) && send({ type: 'scene.delete', id: s.id })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={create}>
        <input
          placeholder={t('sceneName')}
          aria-label={t('sceneName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
        <button type="submit">+ {t('newScene')}</button>
      </form>
    </Section>
  );
}

function SceneSettings() {
  const scene = useGame((s) => (s.viewSceneId ? s.scenes[s.viewSceneId] : undefined));
  const [grid, setGrid] = useState(scene?.gridSize ?? 70);
  useEffect(() => setGrid(scene?.gridSize ?? 70), [scene?.gridSize]);
  if (!scene) return null;
  return (
    <Section title={`${t('map')}: ${scene.name}`}>
      <div className="stack">
        <ImagePicker
          value={scene.mapAssetId}
          onChange={(id) => send({ type: 'scene.update', id: scene.id, mapAssetId: id })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={scene.gridVisible}
            onChange={(e) =>
              send({ type: 'scene.update', id: scene.id, gridVisible: e.target.checked })
            }
          />
          {t('grid')}
        </label>
        <label className="inline">
          {t('gridSize')}
          <input
            type="number"
            min={10}
            max={500}
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
            onBlur={() =>
              grid >= 10 &&
              grid <= 500 &&
              grid !== scene.gridSize &&
              send({ type: 'scene.update', id: scene.id, gridSize: Math.round(grid) })
            }
          />
        </label>
      </div>
    </Section>
  );
}

function TokenForm({ token }: { token?: Token }) {
  const sceneId = useGame((s) => s.viewSceneId);
  const scene = useGame((s) => (s.viewSceneId ? s.scenes[s.viewSceneId] : undefined));
  const players = Object.values(useGame((s) => s.players));
  const [name, setName] = useState(token?.name ?? '');
  const [color, setColor] = useState(token?.color ?? PLAYER_COLORS[2]!);
  const [size, setSize] = useState(token?.size ?? 1);
  const [hidden, setHidden] = useState(token?.hidden ?? false);
  const [owner, setOwner] = useState(token?.ownerPlayerId ?? '');
  const [assetId, setAssetId] = useState<string | null>(token?.assetId ?? null);

  // Nur bei echten Eigenschaftsänderungen übernehmen, nicht bei jeder Bewegung der Figur.
  const tokenKey = token
    ? JSON.stringify([
        token.name,
        token.color,
        token.size,
        token.hidden,
        token.ownerPlayerId,
        token.assetId,
      ])
    : '';
  useEffect(() => {
    if (!token) return;
    setName(token.name);
    setColor(token.color);
    setSize(token.size);
    setHidden(token.hidden);
    setOwner(token.ownerPlayerId ?? '');
    setAssetId(token.assetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenKey]);

  if (!sceneId || !scene) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = Math.min(20, Math.max(0.25, Number(size) || 1));
    if (token) {
      send({
        type: 'token.update',
        id: token.id,
        name: name.trim(),
        color,
        size: s,
        hidden,
        ownerPlayerId: owner || null,
        assetId,
      });
      return;
    }
    const c = mapCenter() ?? { x: scene.mapWidth / 2, y: scene.mapHeight / 2 };
    const g = scene.gridSize;
    const x = scene.gridVisible ? (Math.floor(c.x / g) + 0.5) * g : c.x;
    const y = scene.gridVisible ? (Math.floor(c.y / g) + 0.5) * g : c.y;
    send({
      type: 'token.create',
      sceneId,
      name: name.trim(),
      color,
      size: s,
      hidden,
      ownerPlayerId: owner || null,
      assetId,
      x: Math.round(x),
      y: Math.round(y),
    });
    setName('');
  };

  return (
    <form className="stack token-form" onSubmit={submit}>
      <div className="row">
        <label className="grow">
          {t('tokenName')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label>
          {t('color')}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label>
          {t('size')}
          <input
            type="number"
            min={0.25}
            max={20}
            step={0.25}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="narrow"
          />
        </label>
      </div>
      <label>
        {t('image')}
        <ImagePicker value={assetId} onChange={setAssetId} />
      </label>
      <div className="row">
        <label className="inline grow">
          {t('owner')}
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t('gm')}</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />{' '}
          {t('hiddenToken')}
        </label>
      </div>
      <div className="row end">
        {token && (
          <button
            type="button"
            className="secondary danger"
            onClick={() =>
              confirmDelete(token.name || '?') && send({ type: 'token.delete', id: token.id })
            }
          >
            {t('delete')}
          </button>
        )}
        <button type="submit">{token ? t('save') : t('addToken')}</button>
      </div>
    </form>
  );
}

function Images() {
  const images = useAssets('image');
  const adventureId = useGame((s) => s.adventure?.id);
  return (
    <Section title={t('images')} actions={<UploadButton accept="image/*" label={t('upload')} />}>
      {images.length === 0 && <p className="empty">{t('noImages')}</p>}
      <ul className="image-grid">
        {images.map((a) => (
          <li key={a.id} title={a.name}>
            <img src={assetUrl(a.id, true)} alt={a.name} />
            <span className="small clamp">{a.name}</span>
            <button
              type="button"
              className="icon"
              aria-label={t('delete')}
              onClick={() =>
                adventureId &&
                window.confirm(t('deleteAssetConfirm', { name: a.name })) &&
                void api.del(`/api/adventures/${adventureId}/assets/${a.id}`)
              }
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ScenePanel() {
  const selected = useGame((s) => (s.selectedTokenId ? s.tokens[s.selectedTokenId] : undefined));
  const hasScene = useGame((s) => Boolean(s.viewSceneId && s.scenes[s.viewSceneId]));
  return (
    <div className="panel">
      <Scenes />
      <SceneSettings />
      {hasScene && (
        <Section title={selected ? `${t('selectedToken')}: ${selected.name}` : t('newToken')}>
          {selected ? <TokenForm key={selected.id} token={selected} /> : <TokenForm key="new" />}
          {!selected && <p className="muted small">{t('noSelection')}</p>}
        </Section>
      )}
      <Images />
    </div>
  );
}
