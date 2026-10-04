import { create } from 'zustand';
import type { AudioState } from '@vtt/shared';
import { assetUrl } from './api';
import { useGame } from './store';

/*
 * Spielt die Musik synchron zum Server. Browser erlauben Ton erst nach einem Klick,
 * deshalb gibt es den Schalter "Ton an".
 */

const VOLUME_KEY = 'vtt.volume';

function loadVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null
      ? Math.min(1, Math.max(0, v))
      : 0.8;
  } catch {
    return 0.8;
  }
}

interface SoundState {
  enabled: boolean;
  volume: number;
  blocked: boolean;
  enable(): void;
  setVolume(v: number): void;
}

export const useSound = create<SoundState>((set) => ({
  enabled: false,
  volume: loadVolume(),
  blocked: false,
  enable() {
    set({ enabled: true, blocked: false });
    // Ein leerer Abspielversuch im Klick-Ereignis schaltet Audio für die Seite frei.
    music.muted = true;
    void music
      .play()
      .catch(() => undefined)
      .finally(() => {
        music.muted = false;
        sync();
      });
  },
  setVolume(volume) {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* egal */
    }
    set({ volume });
  },
}));

const music = new Audio();
music.preload = 'auto';
let currentAsset: string | null = null;

function targetPosition(a: AudioState): number {
  const offset = useGame.getState().serverOffset;
  const now = Date.now() + offset;
  let pos = a.playing ? a.position + (now - a.anchor) / 1000 : a.position;
  const d = music.duration;
  if (Number.isFinite(d) && d > 0) pos = a.loop ? pos % d : Math.min(pos, d);
  return Math.max(0, pos);
}

function sync(): void {
  const a = useGame.getState().audio;
  const { enabled, volume } = useSound.getState();
  if (!a || !a.assetId) {
    music.pause();
    currentAsset = null;
    music.removeAttribute('src');
    return;
  }
  if (currentAsset !== a.assetId) {
    currentAsset = a.assetId;
    music.src = assetUrl(a.assetId);
  }
  music.loop = a.loop;
  music.volume = Math.min(1, a.volume * volume);
  if (!a.playing || !enabled) {
    music.pause();
    if (!a.playing && music.readyState > 0) music.currentTime = targetPosition(a);
    return;
  }
  const pos = targetPosition(a);
  const d = music.duration;
  if (!a.loop && Number.isFinite(d) && pos >= d) {
    music.pause();
    return;
  }
  if (music.readyState > 0 && Math.abs(music.currentTime - pos) > 0.75) music.currentTime = pos;
  if (music.paused) {
    music.play().catch(() => useSound.setState({ blocked: true }));
  }
}

music.addEventListener('loadedmetadata', sync);

let lastSfx = 0;
function playSfx(): void {
  const s = useGame.getState().sfx;
  if (!s || s.n === lastSfx) return;
  lastSfx = s.n;
  const { enabled, volume } = useSound.getState();
  if (!enabled) return;
  const fx = new Audio(assetUrl(s.assetId));
  fx.volume = Math.min(1, s.volume * volume);
  void fx.play().catch(() => undefined);
}

let started = false;
/** Einmal beim Betreten des Spieltischs aufrufen. */
export function startAudio(): () => void {
  if (started) return () => undefined;
  started = true;
  const unsubGame = useGame.subscribe((s, prev) => {
    if (s.audio !== prev.audio) sync();
    if (s.sfx !== prev.sfx) playSfx();
  });
  const unsubSound = useSound.subscribe(sync);
  sync();
  return () => {
    unsubGame();
    unsubSound();
    music.pause();
    currentAsset = null;
    started = false;
  };
}
