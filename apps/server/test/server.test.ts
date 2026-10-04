import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServerMessage } from '@vtt/shared';
import {
  Agent,
  Client,
  createAdventure,
  joinPlayer,
  setupGm,
  startServer,
  type Server,
} from './helpers';

let srv: Server;
const open: Client[] = [];
const connect = async (...args: Parameters<typeof Client.connect>) => {
  const c = await Client.connect(...args);
  open.push(c);
  return c;
};

beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  open.splice(0).forEach((c) => c.close());
  await srv.close();
});

const isError = (m: ServerMessage) => m.type === 'error';

describe('Konten', () => {
  it('erlaubt die Einrichtung nur einmal und prüft Passwörter', async () => {
    const me = await new Agent(srv.base).get('/api/me');
    expect(me.json.needsSetup).toBe(true);
    await setupGm(srv.base);
    expect(
      (await new Agent(srv.base).post('/api/setup', { name: 'B', password: 'geheim123' })).status,
    ).toBe(403);
    expect(
      (await new Agent(srv.base).post('/api/login', { name: 'Leitung', password: 'falsch!!' }))
        .status,
    ).toBe(401);
    const ok = new Agent(srv.base);
    expect((await ok.post('/api/login', { name: 'leitung', password: 'geheim123' })).status).toBe(
      200,
    );
    expect((await ok.get('/api/me')).json.gm.name).toBe('Leitung');
  });

  it('verweigert Abenteuer ohne Anmeldung und fremde Abenteuer', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm);
    expect((await new Agent(srv.base).get('/api/adventures')).status).toBe(401);
    await gm.post('/api/gms', { name: 'Zweite', password: 'geheim456' });
    const other = new Agent(srv.base);
    await other.post('/api/login', { name: 'Zweite', password: 'geheim456' });
    expect((await other.request('DELETE', `/api/adventures/${adv.id}`)).status).toBe(404);
    expect((await other.get(`/api/adventures/${adv.id}/export`)).status).toBe(404);
  });
});

describe('Sichtbarkeit', () => {
  it('gibt Spielern keine Geheimnisse des Spielleiters', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm, true);
    const player = await joinPlayer(srv.base, adv.inviteToken, 'Alex');

    const g = await connect(srv.base, adv.id, gm);
    const p = await connect(srv.base, adv.id, player);

    expect(g.state.me.role).toBe('gm');
    expect(g.state.tokens.some((t) => t.hidden)).toBe(true);
    expect(g.state.notes.length).toBe(1);
    expect(g.state.handouts.length).toBe(1);
    expect(g.state.adventure.inviteToken).toBeTruthy();

    expect(p.state.me.role).toBe('player');
    expect(p.state.tokens.length).toBe(g.state.tokens.length - 1);
    expect(p.state.tokens.some((t) => t.hidden)).toBe(false);
    expect(p.state.notes).toEqual([]);
    expect(p.state.handouts).toEqual([]);
    expect(p.state.assets).toEqual([]);
    expect(p.state.adventure.inviteToken).toBeUndefined();
    const raw = JSON.stringify(p.messages);
    expect(raw).not.toContain('Lauerndes Ungeheuer');
    expect(raw).not.toContain('Was hier passiert');
    expect(raw).not.toContain(adv.inviteToken);
  });

  it('deckt Handouts gezielt auf und wieder zu', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm, true);
    const alex = await joinPlayer(srv.base, adv.inviteToken, 'Alex');
    const kim = await joinPlayer(srv.base, adv.inviteToken, 'Kim');
    const g = await connect(srv.base, adv.id, gm);
    const a = await connect(srv.base, adv.id, alex);
    const k = await connect(srv.base, adv.id, kim);
    const handout = g.state.handouts[0]!;
    const alexId = a.state.me.playerId!;

    const kSince = k.messages.length;
    // Spieler dürfen Handouts nicht selbst aufdecken …
    const denied = await a.act(
      { type: 'handout.update', id: handout.id, visibility: 'all' },
      isError,
    );
    expect(denied.type).toBe('error');

    // … der Spielleiter darf.
    const revealed = a.next((m) => m.type === 'upsert' && m.kind === 'handout');
    g.send({ type: 'handout.update', id: handout.id, visibility: 'some', playerIds: [alexId] });
    const m = (await revealed) as Extract<ServerMessage, { type: 'upsert'; kind: 'handout' }>;
    expect(m.item.title).toBe('Ein zerknitterter Brief');
    expect(m.item.playerIds).toEqual([]);
    const kimMsgs = await k.settle(kSince);
    expect(kimMsgs.some((x) => x.type === 'upsert' && x.kind === 'handout')).toBe(false);

    const hidden = a.next((x) => x.type === 'remove' && x.kind === 'handout');
    g.send({ type: 'handout.update', id: handout.id, visibility: 'none' });
    await expect(hidden).resolves.toMatchObject({ id: handout.id });
  });

  it('zeigt verdeckte Würfe nur Spielleiter und Werfendem', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm);
    const alex = await joinPlayer(srv.base, adv.inviteToken, 'Alex');
    const kim = await joinPlayer(srv.base, adv.inviteToken, 'Kim');
    const g = await connect(srv.base, adv.id, gm);
    const a = await connect(srv.base, adv.id, alex);
    const k = await connect(srv.base, adv.id, kim);

    const kSince = k.messages.length;
    const gmGot = g.next((m) => m.type === 'message');
    const mine = await a.act(
      { type: 'dice.roll', expression: '2W6+1', hidden: true, label: 'Heimlich' },
      (m) => m.type === 'message',
    );
    expect(mine.type === 'message' && mine.item.roll?.total).toBeGreaterThanOrEqual(3);
    expect((await gmGot).type).toBe('message');
    expect((await k.settle(kSince)).some((m) => m.type === 'message')).toBe(false);

    const err = await a.act({ type: 'dice.roll', expression: '1000d6' }, isError);
    expect(err.type === 'error' && err.message).toContain('Würfel');
  });
});

describe('Spielfiguren und Szenen', () => {
  it('lässt Spieler nur eigene Figuren bewegen', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm, true);
    const alex = await joinPlayer(srv.base, adv.inviteToken, 'Alex');
    const g = await connect(srv.base, adv.id, gm);
    const a = await connect(srv.base, adv.id, alex);
    const token = a.state.tokens[0]!;

    const denied = await a.act({ type: 'token.move', id: token.id, x: 10, y: 10 }, isError);
    expect(denied.type).toBe('error');

    await a.act(
      { type: 'token.update', id: token.id, ownerPlayerId: a.state.me.playerId },
      isError,
    );
    const owned = a.next((m) => m.type === 'upsert' && m.kind === 'token');
    g.send({ type: 'token.update', id: token.id, ownerPlayerId: a.state.me.playerId });
    await owned;

    const seen = g.next((m) => m.type === 'upsert' && m.kind === 'token' && m.item.x === 105);
    a.send({ type: 'token.move', id: token.id, x: 105, y: 210 });
    await expect(seen).resolves.toBeTruthy();
  });

  it('versteckt Figuren beim Verbergen und zeigt beim Szenenwechsel nur die aktive Szene', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm, true);
    const alex = await joinPlayer(srv.base, adv.inviteToken, 'Alex');
    const g = await connect(srv.base, adv.id, gm);
    const a = await connect(srv.base, adv.id, alex);
    const token = a.state.tokens[0]!;

    const gone = a.next((m) => m.type === 'remove' && m.kind === 'token');
    g.send({ type: 'token.update', id: token.id, hidden: true });
    await expect(gone).resolves.toMatchObject({ id: token.id });

    const created = await g.act(
      { type: 'scene.create', name: 'Taverne' },
      (m) => m.type === 'upsert' && m.kind === 'scene' && m.item.name === 'Taverne',
    );
    const sceneId = created.type === 'upsert' ? created.item.id : '';
    const resync = a.next((m) => m.type === 'snapshot');
    g.send({ type: 'scene.activate', id: sceneId });
    const snap = await resync;
    expect(snap.type === 'snapshot' && snap.state.scenes.map((s) => s.name)).toEqual(['Taverne']);
    expect(snap.type === 'snapshot' && snap.state.tokens).toEqual([]);
  });
});

describe('Dateien', () => {
  it('liefert Dateien nur an Mitglieder des Abenteuers', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm, true);
    const g = await connect(srv.base, adv.id, gm);
    const assetId = g.state.assets[0]!.id;
    expect((await gm.get(`/api/assets/${assetId}`)).status).toBe(200);
    expect((await new Agent(srv.base).get(`/api/assets/${assetId}`)).status).toBe(404);
    const alex = await joinPlayer(srv.base, adv.inviteToken, 'Alex');
    const r = await alex.get(`/api/assets/${assetId}?thumb=1`);
    expect(r.status).toBe(200);
    expect(r.raw.headers.get('content-type')).toContain('image/webp');
  });

  it('lehnt unbekannte Dateitypen ab', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm);
    const form = new FormData();
    form.append(
      'file',
      new Blob(['<script>alert(1)</script>'], { type: 'text/html' }),
      'boese.html',
    );
    const r = await gm.request('POST', `/api/adventures/${adv.id}/assets`, form);
    expect(r.status).toBe(400);
  });
});

describe('Export und Import', () => {
  it('überträgt ein Abenteuer vollständig mit neuen IDs', async () => {
    const gm = await setupGm(srv.base);
    const adv = await createAdventure(gm, true);
    const before = await connect(srv.base, adv.id, gm);

    const exp = await gm.get(`/api/adventures/${adv.id}/export`);
    expect(exp.status).toBe(200);
    const zip = new Uint8Array(await exp.raw.arrayBuffer());
    const form = new FormData();
    form.append('file', new Blob([zip], { type: 'application/zip' }), 'export.zip');
    const imp = await gm.request('POST', '/api/import', form);
    expect(imp.status).toBe(200);
    const after = await connect(srv.base, imp.json.adventure.id, gm);

    const count = (s: typeof before.state) => [
      s.scenes.length,
      s.tokens.length,
      s.handouts.length,
      s.notes.length,
      s.assets.length,
    ];
    expect(count(after.state)).toEqual(count(before.state));
    expect(after.state.adventure.activeSceneId).toBeTruthy();
    expect(after.state.adventure.activeSceneId).not.toBe(before.state.adventure.activeSceneId);
    expect(after.state.scenes[0]!.mapAssetId).toBe(
      after.state.assets.find((x) => x.name === 'Beispiel-Gewölbe')!.id,
    );

    const bad = new FormData();
    bad.append('file', new Blob(['kein zip'], { type: 'application/zip' }), 'x.zip');
    expect((await gm.request('POST', '/api/import', bad)).status).toBe(400);
  });
});
