import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage, Snapshot } from '@vtt/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

export async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-test-'));
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir, port: 0 };
  const built = await buildApp(config);
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = built.app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    ...built,
    dataDir,
    base: `http://127.0.0.1:${port}`,
    async close() {
      await built.app.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export type Server = Awaited<ReturnType<typeof startServer>>;

/** Kleiner HTTP-Client, der Cookies wie ein Browser mitführt. */
export class Agent {
  cookies = new Map<string, string>();
  constructor(private base: string) {}

  get cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(
    method: string,
    url: string,
    body?: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testhilfe, Antworten werden im Test geprüft
  ): Promise<{ status: number; json: any; raw: Response }> {
    const headers: Record<string, string> = { cookie: this.cookieHeader };
    let payload: RequestInit['body'];
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const raw = await fetch(this.base + url, { method, headers, body: payload });
    for (const c of raw.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair!.indexOf('=');
      const k = pair!.slice(0, i);
      const v = pair!.slice(i + 1);
      if (v === '' || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const type = raw.headers.get('content-type') ?? '';
    const json = type.includes('json') ? await raw.json() : null;
    return { status: raw.status, json, raw };
  }
  get = (url: string) => this.request('GET', url);
  post = (url: string, body?: unknown) => this.request('POST', url, body ?? {});
}

/** WebSocket-Client, der alle Servernachrichten sammelt. */
export class Client {
  messages: ServerMessage[] = [];
  state!: Snapshot;
  /** Wird mit dem Schließcode erfüllt, sobald der Server die Verbindung beendet. */
  closed!: Promise<number>;
  private ws!: WebSocket;
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];

  static async connect(base: string, adventureId: string, agent: Agent): Promise<Client> {
    const c = new Client();
    c.ws = new WebSocket(`${base.replace('http', 'ws')}/ws?adventure=${adventureId}`, {
      headers: { cookie: agent.cookieHeader },
    });
    c.closed = new Promise((resolve) => c.ws.once('close', (code) => resolve(code)));
    c.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as ServerMessage;
      c.messages.push(m);
      if (m.type === 'snapshot') c.state = m.state;
      c.waiters = c.waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
    });
    await new Promise<void>((resolve, reject) => {
      c.ws.once('close', (code) => reject(new Error(`closed ${code}`)));
      c.next((m) => m.type === 'snapshot').then(() => resolve(), reject);
    });
    return c;
  }

  next(pred: (m: ServerMessage) => boolean, timeout = 2000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Zeitüberschreitung beim Warten auf Nachricht')),
        timeout,
      );
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Sendet und wartet auf die erste passende Antwort. */
  async act(msg: ClientMessage, pred: (m: ServerMessage) => boolean): Promise<ServerMessage> {
    const p = this.next(pred);
    this.send(msg);
    return p;
  }

  /** Gibt dem Server kurz Zeit und liefert alle bisher empfangenen Nachrichten seit `since`. */
  async settle(since: number, ms = 150): Promise<ServerMessage[]> {
    await new Promise((r) => setTimeout(r, ms));
    return this.messages.slice(since);
  }

  close() {
    this.ws.close();
  }
}

export async function setupGm(base: string, name = 'Leitung', password = 'geheim123') {
  const gm = new Agent(base);
  const r = await gm.post('/api/setup', { name, password });
  if (r.status !== 200) throw new Error(`setup failed ${r.status}`);
  return gm;
}

export async function createAdventure(gm: Agent, samples = false) {
  const r = await gm.post('/api/adventures', { name: 'Testabenteuer', samples });
  return r.json.adventure as { id: string; inviteToken: string };
}

export async function joinPlayer(base: string, inviteToken: string, name: string) {
  const p = new Agent(base);
  const r = await p.post(`/api/join/${inviteToken}`, { name });
  if (r.status !== 200) throw new Error(`join failed ${r.status}`);
  return p;
}
