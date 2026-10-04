import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Message, RolledTerm } from '@vtt/shared';
import {
  describeTerm,
  germanExpression,
  naturalD20,
  percentileOutcome,
  type SuccessLevel,
} from '@vtt/shared/dice';
import { send } from '../lib/socket';
import { setSpeaker, speakableCharacters, useSpeaker } from '../lib/speaker';
import { useGame } from '../lib/store';
import { t, type TextKey } from '../i18n';
import { DieIcon, RolledDie } from './DieIcon';

const QUICK = [4, 6, 8, 10, 12, 20, 100];

const OUTCOME: Record<SuccessLevel, { key: TextKey; cls: string }> = {
  extreme: { key: 'outcomeExtreme', cls: 'success' },
  hard: { key: 'outcomeHard', cls: 'success' },
  regular: { key: 'outcomeRegular', cls: 'success' },
  failure: { key: 'outcomeFailure', cls: 'failure' },
  fumble: { key: 'outcomeFumble', cls: 'failure' },
};

/** Ein Teil der Rechnung: Würfel mit Augen oder eine feste Zahl. */
function Term({ term, first }: { term: RolledTerm; first: boolean }) {
  const sign = term.sign === -1 ? '−' : first ? '' : '+';
  if (term.type === 'number') {
    return (
      <span className="term">
        {sign && <span className="op">{sign}</span>}
        <span className="num">{term.value}</span>
      </span>
    );
  }
  return (
    <span className="term" title={describeTerm(term)}>
      {sign && <span className="op">{sign}</span>}
      {term.rolls.map((d, i) => (
        <RolledDie key={i} sides={term.sides} value={d.value} kept={d.kept} />
      ))}
    </span>
  );
}

function RollBody({ m }: { m: Message }) {
  const r = m.roll!;
  const dice = r.terms.filter((x): x is Extract<RolledTerm, { type: 'dice' }> => x.type === 'dice');
  const keepNote = dice.filter((d) => d.keep).map(describeTerm);
  const nat = naturalD20(r);
  const outcome = m.target !== null ? percentileOutcome(r.total, m.target) : null;
  const simple = r.terms.length === 1 && dice.length === 1 && dice[0]!.count === 1;

  return (
    <div className="roll">
      <div className="roll-what">
        {t('rolls')} <strong>{m.text || germanExpression(r.expression)}</strong>
        {m.text && <span className="expr"> · {germanExpression(r.expression)}</span>}
      </div>
      {keepNote.length > 0 && <div className="roll-note">{keepNote.join(' · ')}</div>}
      <div className="roll-line">
        {!simple && (
          <span className="roll-terms">
            {r.terms.map((term, i) => (
              <Term key={i} term={term} first={i === 0} />
            ))}
            <span className="op">=</span>
          </span>
        )}
        {simple && <DieIcon sides={dice[0]!.sides} size={22} />}
        <span className="roll-total" data-testid="roll-total" title={t('total')}>
          {r.total}
        </span>
      </div>
      {(outcome || nat) && (
        <div className="roll-outcome">
          {outcome && (
            <>
              <span className="muted">{t('against', { target: m.target! })}</span>{' '}
              <span className={`outcome ${OUTCOME[outcome].cls}`} data-testid="roll-outcome">
                {t(OUTCOME[outcome].key)}
              </span>
            </>
          )}
          {nat === 20 && <span className="outcome success">{t('nat20')}</span>}
          {nat === 1 && <span className="outcome failure">{t('nat1')}</span>}
        </div>
      )}
    </div>
  );
}

function MessageItem({ m, color }: { m: Message; color: string | undefined }) {
  const time = new Date(m.createdAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const author = m.authorId === 'gm' ? t('asGm') : m.authorName;
  return (
    <li className={`msg msg-${m.kind}${m.hidden ? ' msg-hidden' : ''}`} data-testid="log-entry">
      <div className="msg-head">
        <span className="speaker" data-testid="log-speaker">
          {m.characterName ? (
            <>
              <strong className="char-name">{m.characterName}</strong>{' '}
              <span className="player-name" style={{ color }}>
                ({author})
              </span>
            </>
          ) : (
            <strong style={{ color }}>{author}</strong>
          )}
        </span>
        <time>{time}</time>
      </div>
      {m.kind === 'roll' && m.roll ? <RollBody m={m} /> : <div className="msg-text">{m.text}</div>}
      {m.hidden && <div className="hidden-note">🔒 {t('hiddenRollInfo')}</div>}
    </li>
  );
}

function SpeakerSelect() {
  const adventureId = useGame((s) => s.adventure?.id);
  const characters = useGame((s) => s.characters);
  const me = useGame((s) => s.me);
  const current = useSpeaker();
  const options = speakableCharacters(characters, me?.role, me?.playerId);
  if (!adventureId || !me) return null;
  return (
    <label className="inline speaker-select">
      {t('speakingAs')}
      <select
        aria-label={t('speakingAs')}
        value={current ?? ''}
        onChange={(e) => setSpeaker(adventureId, e.target.value || null)}
      >
        <option value="">{me.role === 'gm' ? t('asGm') : t('asMyself', { name: me.name })}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LogPanel() {
  const messages = useGame((s) => s.messages);
  const players = useGame((s) => s.players);
  const speaker = useSpeaker();
  const [expr, setExpr] = useState('');
  const [label, setLabel] = useState('');
  const [hidden, setHidden] = useState(false);
  const [chat, setChat] = useState('');
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const roll = (expression: string) => {
    if (!expression.trim()) return;
    send({ type: 'dice.roll', expression, label: label.trim() || undefined, hidden, as: speaker });
    setLabel('');
  };

  const onRoll = (e: FormEvent) => {
    e.preventDefault();
    roll(expr);
  };

  const onChat = (e: FormEvent) => {
    e.preventDefault();
    if (!chat.trim()) return;
    send({ type: 'chat.send', text: chat.trim(), as: speaker });
    setChat('');
  };

  return (
    <div className="log-panel">
      <ol className="log" ref={list}>
        {messages.length === 0 && <li className="empty">{t('emptyLog')}</li>}
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            m={m}
            color={m.authorId === 'gm' ? 'var(--gm-ink)' : players[m.authorId]?.color}
          />
        ))}
      </ol>
      <div className="dice-box">
        <SpeakerSelect />
        <div className="quick-dice">
          {QUICK.map((s) => (
            <button
              key={s}
              type="button"
              className="die-btn"
              onClick={() => roll(`d${s}`)}
              title={`W${s}`}
              aria-label={`W${s}`}
            >
              <DieIcon sides={s} size={20} />
              <span>W{s}</span>
            </button>
          ))}
        </div>
        <form className="row" onSubmit={onRoll}>
          <input
            aria-label={t('roll')}
            placeholder={t('rollPlaceholder')}
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
          />
          <button type="submit">{t('roll')}</button>
        </form>
        <div className="row">
          <input
            aria-label={t('rollLabel')}
            placeholder={t('rollLabel')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <label className="check" title={t('hiddenRollHint')}>
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />{' '}
            {t('hiddenRoll')}
          </label>
        </div>
        <form className="row" onSubmit={onChat}>
          <input
            aria-label={t('chatPlaceholder')}
            placeholder={t('chatPlaceholder')}
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            maxLength={2000}
          />
          <button type="submit" className="secondary">
            {t('send')}
          </button>
        </form>
      </div>
    </div>
  );
}
