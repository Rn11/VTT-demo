import { useEffect, useState, type FormEvent } from 'react';
import type { Handout, HandoutVisibility } from '@vtt/shared';
import { assetUrl } from '../lib/api';
import { send } from '../lib/socket';
import { useGame } from '../lib/store';
import { t } from '../i18n';
import { ImagePicker, Modal, Section, confirmDelete } from './ui';

function HandoutView({ h }: { h: Handout }) {
  return (
    <div className="handout-view">
      {h.assetId && (
        <a href={assetUrl(h.assetId)} target="_blank" rel="noreferrer">
          <img src={assetUrl(h.assetId)} alt={h.title} />
        </a>
      )}
      {h.body && <p className="pre">{h.body}</p>}
    </div>
  );
}

function HandoutEditor({ h, onDone }: { h: Handout | null; onDone: () => void }) {
  const [title, setTitle] = useState(h?.title ?? '');
  const [body, setBody] = useState(h?.body ?? '');
  const [assetId, setAssetId] = useState<string | null>(h?.assetId ?? null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (h) send({ type: 'handout.update', id: h.id, title: title.trim(), body, assetId });
    else send({ type: 'handout.create', title: title.trim(), body, assetId });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <label>
        {t('title')}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          autoFocus
        />
      </label>
      <label>
        {t('text')}
        <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label>
        {t('image')}
        <ImagePicker value={assetId} onChange={setAssetId} />
      </label>
      <div className="row end">
        <button type="button" className="secondary" onClick={onDone}>
          {t('cancel')}
        </button>
        <button type="submit">{h ? t('save') : t('create')}</button>
      </div>
    </form>
  );
}

function VisibilityControl({ h }: { h: Handout }) {
  const players = Object.values(useGame((s) => s.players));
  const setVis = (visibility: HandoutVisibility) =>
    send({ type: 'handout.update', id: h.id, visibility });
  const toggle = (pid: string, on: boolean) => {
    const ids = on ? [...h.playerIds, pid] : h.playerIds.filter((x) => x !== pid);
    send({ type: 'handout.update', id: h.id, visibility: 'some', playerIds: ids });
  };
  return (
    <div className="visibility">
      <select
        aria-label={t('visibility')}
        value={h.visibility}
        onChange={(e) => setVis(e.target.value as HandoutVisibility)}
      >
        <option value="none">{t('visNone')}</option>
        <option value="all">{t('visAll')}</option>
        <option value="some">{t('visSome')}</option>
      </select>
      {h.visibility === 'some' && (
        <div className="player-checks">
          {players.length === 0 && <em>{t('noPlayersYet')}</em>}
          {players.map((p) => (
            <label key={p.id} className="check">
              <input
                type="checkbox"
                checked={h.playerIds.includes(p.id)}
                onChange={(e) => toggle(p.id, e.target.checked)}
              />
              <span style={{ color: p.color }}>{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function HandoutsPanel() {
  const isGm = useGame((s) => s.me?.role === 'gm');
  const handouts = Object.values(useGame((s) => s.handouts)).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  const unseen = useGame((s) => s.unseenHandouts);
  const [editing, setEditing] = useState<Handout | 'new' | null>(null);
  const [viewing, setViewing] = useState<Handout | null>(null);
  const [fresh] = useState(() => new Set(unseen));

  useEffect(() => {
    useGame.getState().markHandoutsSeen();
  }, [unseen.length]);

  if (!isGm) {
    return (
      <div className="panel">
        {handouts.length === 0 && <p className="empty">{t('noHandoutsPlayer')}</p>}
        <ul className="cards">
          {handouts.map((h) => (
            <li
              key={h.id}
              className="card clickable"
              onClick={() => setViewing(h)}
              data-testid="handout"
            >
              {h.assetId && <img src={assetUrl(h.assetId, true)} alt="" className="thumb" />}
              <div>
                <strong>{h.title}</strong>{' '}
                {(fresh.has(h.id) || unseen.includes(h.id)) && (
                  <span className="badge">{t('newBadge')}</span>
                )}
                {h.body && <p className="muted clamp">{h.body}</p>}
              </div>
            </li>
          ))}
        </ul>
        {viewing && (
          <Modal title={viewing.title} onClose={() => setViewing(null)}>
            <HandoutView h={handouts.find((x) => x.id === viewing.id) ?? viewing} />
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <Section
        title={t('tabHandouts')}
        actions={
          <button type="button" onClick={() => setEditing('new')}>
            + {t('newHandout')}
          </button>
        }
      >
        {handouts.length === 0 && <p className="empty">{t('noHandoutsGm')}</p>}
        <ul className="cards">
          {handouts.map((h) => (
            <li
              key={h.id}
              className={`card${h.visibility === 'none' ? ' covered' : ''}`}
              data-testid="handout"
            >
              {h.assetId && (
                <img
                  src={assetUrl(h.assetId, true)}
                  alt=""
                  className="thumb clickable"
                  onClick={() => setViewing(h)}
                />
              )}
              <div className="grow">
                <strong className="clickable" onClick={() => setViewing(h)}>
                  {h.title}
                </strong>
                <VisibilityControl h={h} />
                <div className="row">
                  <button type="button" className="link" onClick={() => setEditing(h)}>
                    {t('edit')}
                  </button>
                  <button
                    type="button"
                    className="link danger"
                    onClick={() =>
                      confirmDelete(h.title) && send({ type: 'handout.delete', id: h.id })
                    }
                  >
                    {t('delete')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      {editing && (
        <Modal
          title={editing === 'new' ? t('newHandout') : editing.title}
          onClose={() => setEditing(null)}
        >
          <HandoutEditor h={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
      {viewing && (
        <Modal title={viewing.title} onClose={() => setViewing(null)}>
          <HandoutView h={handouts.find((x) => x.id === viewing.id) ?? viewing} />
        </Modal>
      )}
    </div>
  );
}
