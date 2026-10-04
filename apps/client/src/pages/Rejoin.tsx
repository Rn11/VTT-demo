import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { t } from '../i18n';

/** Persönlicher Wiederbeitritts-Link: setzt den Zugang und leitet zum Spieltisch weiter. */
export function RejoinPage({ code }: { code: string }) {
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    api
      .post<{ adventureId: string }>(`/api/rejoin/${encodeURIComponent(code)}`)
      .then((r) => navigate(`/a/${r.adventureId}`, true))
      .catch(() => setInvalid(true));
  }, [code]);
  return <div className="center-msg">{invalid ? t('rejoinInvalid') : t('loading')}</div>;
}
