import { useEffect, useState, type FormEvent } from 'react';
import type { Character } from '@vtt/shared';
import {
  SHEET_TEMPLATES,
  fieldRollExpression,
  getTemplate,
  type SheetField,
} from '@vtt/shared/sheets';
import { send } from '../lib/socket';
import { useGame } from '../lib/store';
import { t } from '../i18n';
import { Modal, Section, confirmDelete } from './ui';

type Value = string | number | boolean;

function Field({
  field,
  value,
  editable,
  onSave,
  onRoll,
}: {
  field: SheetField;
  value: Value | undefined;
  editable: boolean;
  onSave: (v: Value) => void;
  onRoll: (expr: string, target: number | null) => void;
}) {
  const [local, setLocal] = useState<Value>(value ?? (field.type === 'check' ? false : ''));
  useEffect(() => setLocal(value ?? (field.type === 'check' ? false : '')), [value, field.type]);

  const commit = () => {
    if (local === (value ?? (field.type === 'check' ? false : ''))) return;
    if (field.type === 'number') {
      const n = String(local).trim() === '' ? '' : Number(String(local).replace(',', '.'));
      onSave(typeof n === 'number' && !Number.isFinite(n) ? '' : n);
    } else onSave(local);
  };

  const expr = fieldRollExpression(field, local);
  const id = `f-${field.key}`;

  let input;
  if (field.type === 'textarea') {
    input = (
      <textarea
        id={id}
        rows={3}
        value={String(local)}
        disabled={!editable}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
      />
    );
  } else if (field.type === 'check') {
    input = (
      <input
        id={id}
        type="checkbox"
        checked={Boolean(local)}
        disabled={!editable}
        onChange={(e) => {
          setLocal(e.target.checked);
          onSave(e.target.checked);
        }}
      />
    );
  } else {
    input = (
      <input
        id={id}
        type="text"
        inputMode={field.type === 'number' ? 'numeric' : undefined}
        value={String(local)}
        disabled={!editable}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    );
  }

  return (
    <div className={`field field-${field.type}`}>
      <label htmlFor={id}>{field.label}</label>
      <div className="field-input">
        {input}
        {expr && editable && (
          <button
            type="button"
            className="die-btn small"
            title={t('rollField')}
            onClick={() => onRoll(expr, field.under ? Number(local) || 0 : null)}
          >
            🎲
          </button>
        )}
      </div>
    </div>
  );
}

function Sheet({ c }: { c: Character }) {
  const me = useGame((s) => s.me);
  const players = useGame((s) => s.players);
  const isGm = me?.role === 'gm';
  const editable = isGm || (c.ownerPlayerId !== null && c.ownerPlayerId === me?.playerId);
  const template = getTemplate(c.templateId);
  const [name, setName] = useState(c.name);
  useEffect(() => setName(c.name), [c.name]);

  const save = (key: string, v: Value) =>
    send({ type: 'character.update', id: c.id, values: { [key]: v } });
  const roll = (field: SheetField) => (expr: string, target: number | null) =>
    send({
      type: 'dice.roll',
      expression: expr,
      label: field.label,
      as: c.id,
      ...(target !== null ? { target } : {}),
    });

  const setCustom = (custom: Character['custom']) =>
    send({ type: 'character.update', id: c.id, custom });

  return (
    <div className="sheet">
      {!editable && (
        <p className="muted">
          {t('readOnly', {
            name: c.ownerPlayerId ? (players[c.ownerPlayerId]?.name ?? '?') : t('gm'),
          })}
        </p>
      )}
      <div className="sheet-head">
        <label>
          {t('name')}
          <input
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() &&
              name !== c.name &&
              send({ type: 'character.update', id: c.id, name: name.trim() })
            }
          />
        </label>
        {isGm && (
          <label>
            {t('owner')}
            <select
              value={c.ownerPlayerId ?? ''}
              onChange={(e) =>
                send({ type: 'character.update', id: c.id, ownerPlayerId: e.target.value || null })
              }
            >
              <option value="">{t('npc')}</option>
              {Object.values(players).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="muted">{template.name}</span>
      </div>
      {template.sections.map((sec) => (
        <fieldset key={sec.title}>
          <legend>{sec.title}</legend>
          <div
            className={`fields${sec.fields.every((f) => f.type !== 'textarea') ? ' compact' : ''}`}
          >
            {sec.fields.map((f) => (
              <Field
                key={f.key}
                field={f}
                value={c.values[f.key]}
                editable={editable}
                onSave={(v) => save(f.key, v)}
                onRoll={roll(f)}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend>{t('customFields')}</legend>
        {c.custom.map((cf, i) => (
          <div key={`${i}|${cf.label}|${cf.value}`} className="row custom-field">
            <input
              aria-label={t('fieldLabel')}
              defaultValue={cf.label}
              disabled={!editable}
              onBlur={(e) =>
                e.target.value !== cf.label &&
                setCustom(c.custom.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
            />
            <input
              aria-label={t('fieldValue')}
              defaultValue={cf.value}
              disabled={!editable}
              onBlur={(e) =>
                e.target.value !== cf.value &&
                setCustom(c.custom.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
              }
            />
            {editable && (
              <button
                type="button"
                className="icon"
                aria-label={t('delete')}
                onClick={() => setCustom(c.custom.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {editable && (
          <button
            type="button"
            className="link"
            onClick={() => setCustom([...c.custom, { label: t('fieldLabel'), value: '' }])}
          >
            + {t('addField')}
          </button>
        )}
      </fieldset>
    </div>
  );
}

function NewCharacter({ onDone }: { onDone: () => void }) {
  const me = useGame((s) => s.me);
  const players = useGame((s) => s.players);
  const [name, setName] = useState(me?.role === 'player' ? me.name : '');
  const [templateId, setTemplateId] = useState('free');
  const [owner, setOwner] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    send({ type: 'character.create', name: name.trim(), templateId, ownerPlayerId: owner || null });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <label>
        {t('name')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoFocus
        />
      </label>
      <label>
        {t('template')}
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {SHEET_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </label>
      {me?.role === 'gm' && (
        <label>
          {t('owner')}
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t('npc')}</option>
            {Object.values(players).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row end">
        <button type="button" className="secondary" onClick={onDone}>
          {t('cancel')}
        </button>
        <button type="submit">{t('create')}</button>
      </div>
    </form>
  );
}

export function CharactersPanel() {
  const characters = Object.values(useGame((s) => s.characters));
  const players = useGame((s) => s.players);
  const me = useGame((s) => s.me);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const open = openId ? characters.find((c) => c.id === openId) : undefined;
  const isGm = me?.role === 'gm';

  const mine = (c: Character) => c.ownerPlayerId !== null && c.ownerPlayerId === me?.playerId;
  const sorted = [...characters].sort(
    (a, b) => Number(mine(b)) - Number(mine(a)) || a.name.localeCompare(b.name),
  );

  return (
    <div className="panel">
      <Section
        title={t('tabCharacters')}
        actions={
          <button type="button" onClick={() => setCreating(true)}>
            + {t('newCharacter')}
          </button>
        }
      >
        {characters.length === 0 && <p className="empty">{t('noCharacters')}</p>}
        <ul className="cards">
          {sorted.map((c) => (
            <li
              key={c.id}
              className="card clickable"
              onClick={() => setOpenId(c.id)}
              data-testid="character"
            >
              <div className="grow">
                <strong>{c.name}</strong>
                <div className="muted small">
                  {getTemplate(c.templateId).name} ·{' '}
                  {c.ownerPlayerId ? (players[c.ownerPlayerId]?.name ?? '?') : t('npc')}
                </div>
              </div>
              {isGm && (
                <button
                  type="button"
                  className="link danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmDelete(c.name)) send({ type: 'character.delete', id: c.id });
                  }}
                >
                  {t('delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      {creating && (
        <Modal title={t('newCharacter')} onClose={() => setCreating(false)}>
          <NewCharacter onDone={() => setCreating(false)} />
        </Modal>
      )}
      {open && (
        <Modal title={open.name} onClose={() => setOpenId(null)}>
          <Sheet c={open} />
        </Modal>
      )}
    </div>
  );
}
