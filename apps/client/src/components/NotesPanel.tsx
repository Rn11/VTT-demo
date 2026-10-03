import { useEffect, useState } from 'react';
import type { Note } from '@vtt/shared';
import { send } from '../lib/socket';
import { useGame } from '../lib/store';
import { t } from '../i18n';
import { Section, confirmDelete } from './ui';

function NoteEditor({ note }: { note: Note }) {
  const scenes = Object.values(useGame((s) => s.scenes)).sort((a, b) => a.sort - b.sort);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);

  // Änderungen von außen übernehmen (z. B. aus einem zweiten Fenster).
  useEffect(() => setTitle(note.title), [note.title]);
  useEffect(() => setBody(note.body), [note.body]);

  const saveTitle = () =>
    title.trim() &&
    title !== note.title &&
    send({ type: 'note.update', id: note.id, title: title.trim() });
  const saveBody = () => body !== note.body && send({ type: 'note.update', id: note.id, body });

  return (
    <li className="card note">
      <div className="grow stack">
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          aria-label={t('title')}
        />
        <textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={saveBody}
          aria-label={t('text')}
        />
        <div className="row">
          <label className="inline">
            {t('noteScene')}{' '}
            <select
              value={note.sceneId ?? ''}
              onChange={(e) =>
                send({ type: 'note.update', id: note.id, sceneId: e.target.value || null })
              }
            >
              <option value="">{t('allScenes')}</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="link danger"
            onClick={() => confirmDelete(note.title) && send({ type: 'note.delete', id: note.id })}
          >
            {t('delete')}
          </button>
        </div>
      </div>
    </li>
  );
}

export function NotesPanel() {
  const notes = Object.values(useGame((s) => s.notes));
  const viewSceneId = useGame((s) => s.viewSceneId);
  // Notizen der gerade bearbeiteten Szene zuerst.
  const sorted = [...notes].sort(
    (a, b) =>
      Number(b.sceneId === viewSceneId) - Number(a.sceneId === viewSceneId) ||
      b.updatedAt - a.updatedAt,
  );
  return (
    <div className="panel">
      <Section
        title={t('tabNotes')}
        actions={
          <button
            type="button"
            onClick={() =>
              send({ type: 'note.create', title: t('newNote'), body: '', sceneId: viewSceneId })
            }
          >
            + {t('newNote')}
          </button>
        }
      >
        {notes.length === 0 && <p className="empty">{t('noNotes')}</p>}
        <ul className="cards">
          {sorted.map((n) => (
            <NoteEditor key={n.id} note={n} />
          ))}
        </ul>
      </Section>
    </div>
  );
}
