import { useEffect, useState } from 'react';
import { api, type Gm } from './lib/api';
import { usePath } from './lib/router';
import { t } from './i18n';
import { AuthPage } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { JoinPage } from './pages/Join';
import { RejoinPage } from './pages/Rejoin';
import { TablePage } from './pages/Table';

type Me = { gm: Gm | null; needsSetup: boolean };

function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState(false);
  const load = () =>
    api
      .get<Me>('/api/me')
      .then(setMe)
      .catch(() => setError(true));
  useEffect(() => {
    void load();
  }, []);

  if (error) return <div className="center-msg">{t('error')}</div>;
  if (!me) return <div className="center-msg">{t('loading')}</div>;
  if (me.needsSetup)
    return <AuthPage mode="setup" onDone={(gm) => setMe({ gm, needsSetup: false })} />;
  if (!me.gm) return <AuthPage mode="login" onDone={(gm) => setMe({ gm, needsSetup: false })} />;
  return <Dashboard gm={me.gm} onLogout={() => setMe({ gm: null, needsSetup: false })} />;
}

export function App() {
  const path = usePath();
  const join = /^\/join\/([^/]+)$/.exec(path);
  if (join) return <JoinPage token={decodeURIComponent(join[1]!)} />;
  const rejoin = /^\/rejoin\/([^/]+)$/.exec(path);
  if (rejoin) return <RejoinPage code={decodeURIComponent(rejoin[1]!)} />;
  const table = /^\/a\/([^/]+)$/.exec(path);
  if (table) return <TablePage key={table[1]} adventureId={decodeURIComponent(table[1]!)} />;
  return <Home />;
}
