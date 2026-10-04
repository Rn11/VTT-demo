import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Message, RolledTerm } from '@vtt/shared';
import { send } from '../lib/socket';
import { useGame } from '../lib/store';
import { t } from '../i18n';

const QUICK = [4, 6, 8, 10, 12, 20, 100];

function Term({ term, first }: { term: RolledTerm; first: boolean }) {
  const sign = term.sign === -1 ? '−' : first ? '' : '+';
  if (term.type === 'number')
    return (
      <span className="term">
        {sign} {term.value}
      </span>
    );
  return (
    <span className="term">
      {sign}{' '}
      {term.rolls.map((d, i) => (
        <span
          key={i}
          className={`die${d.kept ? '' : ' dropped'}${d.kept && d.value === term.sides ? ' max' : ''}${d.kept && d.value === 1 ? ' min' : ''}`}
        >
          {d.value}
        </span>
      ))}
    </span>
  );
}

function MessageItem({ m, color }: { m: Message; color: string | undefined }) {
  const time = new Date(m.createdAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <li className={`msg msg-${m.kind}${m.hidden ? ' msg-hidden' : ''}`} data-testid="log-entry">
      <div className="msg-head">
        <strong style={{ color }}>{m.authorName}</strong>
        {m.hidden && <span className="tag">{t('hiddenTag')}</span>}
        <time>{time}</time>
      </div>
      {m.kind === 'roll' && m.roll ? (
        <div className="roll">
          {m.text && <div className="roll-label">{m.text}</div>}
          <div className="roll-line">
            <code>{m.roll.expression}</code>
            <span className="roll-terms">
              {m.roll.terms.map((term, i) => (
                <Term key={i} term={term} first={i === 0} />
              ))}
            </span>
            <span className="roll-total" data-testid="roll-total">
              {m.roll.total}
            </span>
          </div>
        </div>
      ) : (
        <div className="msg-text">{m.text}</div>
      )}
    </li>
  );
}

export function LogPanel() {
  const messages = useGame((s) => s.messages);
  const players = useGame((s) => s.players);
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
    send({ type: 'dice.roll', expression, label: label.trim() || undefined, hidden });
    setLabel('');
  };

  const onRoll = (e: FormEvent) => {
    e.preventDefault();
    roll(expr);
  };

  const onChat = (e: FormEvent) => {
    e.preventDefault();
    if (!chat.trim()) return;
    send({ type: 'chat.send', text: chat.trim() });
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
            color={m.authorId === 'gm' ? '#c9a0ff' : players[m.authorId]?.color}
          />
        ))}
      </ol>
      <div className="dice-box">
        <div className="quick-dice">
          {QUICK.map((s) => (
            <button
              key={s}
              type="button"
              className="die-btn"
              onClick={() => roll(`d${s}`)}
              title={`W${s}`}
            >
              W{s}
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
