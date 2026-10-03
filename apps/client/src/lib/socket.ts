import type { ClientMessage, ServerMessage } from '@vtt/shared';
import { useGame } from './store';

/** Hält die WebSocket-Verbindung zum Spieltisch und verbindet sich bei Abbrüchen neu. */
class GameSocket {
  private ws: WebSocket | null = null;
  private adventureId: string | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  connect(adventureId: string): void {
    this.disconnect();
    this.adventureId = adventureId;
    this.open();
  }

  private open(): void {
    if (!this.adventureId) return;
    const store = useGame.getState();
    store.setStatus(store.me ? 'offline' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/ws?adventure=${encodeURIComponent(this.adventureId)}`,
    );
    this.ws = ws;
    ws.onmessage = (ev) => {
      this.retry = 0;
      useGame.getState().apply(JSON.parse(String(ev.data)) as ServerMessage);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === 4401) return useGame.getState().setStatus('denied');
      if (ev.code === 4404) return useGame.getState().setStatus('gone');
      useGame.getState().setStatus('offline');
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.open(), delay);
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  disconnect(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    this.adventureId = null;
    ws?.close();
  }
}

export const socket = new GameSocket();
export const send = (msg: ClientMessage) => socket.send(msg);
