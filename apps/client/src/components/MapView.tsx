import { useEffect, useRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import type { Scene, Token } from '@vtt/shared';
import { assetUrl } from '../lib/api';
import { send } from '../lib/socket';
import { shownSceneId, useGame, type GameState } from '../lib/store';
import { t } from '../i18n';

/* ---------- Texturen ---------- */

const textures = new Map<string, Promise<Texture>>();
function loadTexture(url: string): Promise<Texture> {
  let p = textures.get(url);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return Texture.from(img);
    })();
    p.catch(() => textures.delete(url));
    textures.set(url, p);
  }
  return p;
}

/* ---------- Figuren ---------- */

class TokenView {
  root = new Container();
  private body = new Graphics();
  private ring = new Graphics();
  private mask = new Graphics();
  private sprite: Sprite | null = null;
  private label: Text;
  private assetId: string | null = null;

  constructor() {
    this.label = new Text({
      text: '',
      style: {
        fontFamily: 'Alegreya Sans, system-ui, sans-serif',
        fontSize: 14,
        fill: '#ffffff',
        stroke: { color: '#000000', width: 4 },
      },
    });
    this.label.anchor.set(0.5, 0);
    this.root.addChild(this.body, this.mask, this.ring, this.label);
    this.root.eventMode = 'static';
  }

  update(
    tok: Token,
    grid: number,
    selected: boolean,
    draggable: boolean,
    ownerColor: string | null,
  ): void {
    const r = (tok.size * grid) / 2;
    this.body.clear().circle(0, 0, r).fill(tok.color);
    this.mask
      .clear()
      .circle(0, 0, r * 0.94)
      .fill('#ffffff');
    this.ring
      .clear()
      .circle(0, 0, r)
      .stroke({
        width: selected ? 5 : 3,
        color: selected ? '#ebcf86' : (ownerColor ?? '#ffffff'),
        alpha: 0.95,
      });
    this.label.text = tok.name;
    this.label.position.set(0, r + 2);
    this.label.style.fontSize = Math.max(11, Math.min(18, grid * 0.22));
    this.root.alpha = tok.hidden ? 0.45 : 1;
    this.root.cursor = draggable ? 'grab' : 'default';
    this.root.hitArea = { contains: (x: number, y: number) => x * x + y * y <= r * r };

    if (tok.assetId !== this.assetId) {
      this.assetId = tok.assetId;
      this.sprite?.destroy();
      this.sprite = null;
      if (tok.assetId) {
        const id = tok.assetId;
        void loadTexture(assetUrl(id)).then((tex) => {
          if (this.assetId !== id || this.root.destroyed) return;
          this.sprite = new Sprite(tex);
          this.sprite.anchor.set(0.5);
          this.sprite.mask = this.mask;
          this.root.addChildAt(this.sprite, 1);
          this.fitSprite(r);
        });
      }
    }
    this.fitSprite(r);
  }

  private fitSprite(r: number): void {
    if (!this.sprite) return;
    const s = (r * 2) / Math.max(this.sprite.texture.width, this.sprite.texture.height);
    this.sprite.scale.set(s);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/* ---------- Karte ---------- */

class MapRenderer {
  private world = new Container();
  private mapLayer = new Container();
  private grid = new Graphics();
  private tokenLayer = new Container();
  private tokens = new Map<string, TokenView>();
  private sceneKey = '';
  private sceneId: string | null = null;
  private mapAsset: string | null = null;
  private drag: { id: string; dx: number; dy: number; moved: boolean; lastSent: number } | null =
    null;
  private pan: { x: number; y: number; wx: number; wy: number } | null = null;
  private state: GameState | null = null;
  private destroyed = false;

  constructor(private app: Application) {
    this.world.addChild(this.mapLayer, this.grid, this.tokenLayer);
    app.stage.addChild(this.world);
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (e) => this.onBackgroundDown(e));
    app.stage.on('globalpointermove', (e) => this.onMove(e));
    app.stage.on('pointerup', () => this.onUp());
    app.stage.on('pointerupoutside', () => this.onUp());
    app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  render(s: GameState): void {
    if (this.destroyed) return;
    this.state = s;
    const sceneId = shownSceneId(s);
    const scene = sceneId ? s.scenes[sceneId] : undefined;
    if (!scene) {
      this.clearScene();
      return;
    }
    const key = `${scene.id}|${scene.mapAssetId}|${scene.mapWidth}x${scene.mapHeight}|${scene.gridSize}|${scene.gridVisible}`;
    if (key !== this.sceneKey) {
      const first = this.sceneId !== scene.id;
      this.sceneKey = key;
      this.sceneId = scene.id;
      this.drawScene(scene);
      if (first) this.fit(scene);
    }
    this.syncTokens(s, scene);
  }

  private clearScene(): void {
    this.sceneKey = '';
    this.sceneId = null;
    this.mapLayer.removeChildren().forEach((c) => c.destroy());
    this.grid.clear();
    for (const v of this.tokens.values()) v.destroy();
    this.tokens.clear();
  }

  private drawScene(scene: Scene): void {
    const w = scene.mapWidth;
    const h = scene.mapHeight;
    if (this.mapAsset !== scene.mapAssetId || this.mapLayer.children.length === 0) {
      this.mapAsset = scene.mapAssetId;
      this.mapLayer.removeChildren().forEach((c) => c.destroy());
      this.mapLayer.addChild(new Graphics().rect(0, 0, w, h).fill('#3a332b'));
      if (scene.mapAssetId) {
        const id = scene.mapAssetId;
        void loadTexture(assetUrl(id)).then((tex) => {
          if (this.mapAsset !== id || this.destroyed) return;
          const sprite = new Sprite(tex);
          sprite.width = w;
          sprite.height = h;
          this.mapLayer.addChild(sprite);
        });
      }
    }
    this.grid.clear();
    if (scene.gridVisible) {
      const g = scene.gridSize;
      for (let x = 0; x <= w; x += g) this.grid.moveTo(x, 0).lineTo(x, h);
      for (let y = 0; y <= h; y += g) this.grid.moveTo(0, y).lineTo(w, y);
      this.grid.stroke({ width: 1, color: '#000000', alpha: 0.35 });
    }
  }

  private syncTokens(s: GameState, scene: Scene): void {
    const isGm = s.me?.role === 'gm';
    const seen = new Set<string>();
    for (const tok of Object.values(s.tokens)) {
      if (tok.sceneId !== scene.id) continue;
      seen.add(tok.id);
      let view = this.tokens.get(tok.id);
      if (!view) {
        const v = new TokenView();
        view = v;
        this.tokens.set(tok.id, v);
        this.tokenLayer.addChild(v.root);
        v.root.on('pointerdown', (e) => this.onTokenDown(e, tok.id));
      }
      const draggable =
        isGm || (tok.ownerPlayerId !== null && tok.ownerPlayerId === s.me?.playerId);
      const ownerColor = tok.ownerPlayerId ? (s.players[tok.ownerPlayerId]?.color ?? null) : null;
      view.update(tok, scene.gridSize, isGm && s.selectedTokenId === tok.id, draggable, ownerColor);
      if (this.drag?.id !== tok.id) view.root.position.set(tok.x, tok.y);
    }
    for (const [id, view] of this.tokens) {
      if (!seen.has(id)) {
        view.destroy();
        this.tokens.delete(id);
      }
    }
  }

  fit(scene: Scene): void {
    const { width, height } = this.app.screen;
    const scale = Math.min(width / scene.mapWidth, height / scene.mapHeight) * 0.95;
    const sc = Math.max(0.05, Math.min(4, scale || 1));
    this.world.scale.set(sc);
    this.world.position.set((width - scene.mapWidth * sc) / 2, (height - scene.mapHeight * sc) / 2);
  }

  /* --- Eingaben --- */

  private canDrag(id: string): boolean {
    const s = this.state;
    const tok = s?.tokens[id];
    if (!s || !tok) return false;
    return (
      s.me?.role === 'gm' || (tok.ownerPlayerId !== null && tok.ownerPlayerId === s.me?.playerId)
    );
  }

  private onTokenDown(e: FederatedPointerEvent, id: string): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (this.state?.me?.role === 'gm') useGame.getState().selectToken(id);
    if (!this.canDrag(id)) return;
    const view = this.tokens.get(id)!;
    const p = this.world.toLocal(e.global);
    this.drag = { id, dx: view.root.x - p.x, dy: view.root.y - p.y, moved: false, lastSent: 0 };
    view.root.cursor = 'grabbing';
    this.tokenLayer.addChild(view.root); // nach oben holen
  }

  private onBackgroundDown(e: FederatedPointerEvent): void {
    if (useGame.getState().selectedTokenId && e.button === 0) useGame.getState().selectToken(null);
    this.pan = { x: e.global.x, y: e.global.y, wx: this.world.x, wy: this.world.y };
  }

  private onMove(e: FederatedPointerEvent): void {
    if (this.drag) {
      const view = this.tokens.get(this.drag.id);
      if (!view) return;
      const p = this.world.toLocal(e.global);
      const x = p.x + this.drag.dx;
      const y = p.y + this.drag.dy;
      view.root.position.set(x, y);
      this.drag.moved = true;
      const now = performance.now();
      if (now - this.drag.lastSent > 80) {
        this.drag.lastSent = now;
        send({ type: 'token.move', id: this.drag.id, x: Math.round(x), y: Math.round(y) });
      }
    } else if (this.pan) {
      this.world.position.set(
        this.pan.wx + e.global.x - this.pan.x,
        this.pan.wy + e.global.y - this.pan.y,
      );
    }
  }

  private onUp(): void {
    this.pan = null;
    const d = this.drag;
    this.drag = null;
    if (!d || !d.moved) return;
    const view = this.tokens.get(d.id);
    const s = this.state;
    const tok = s?.tokens[d.id];
    const scene = this.sceneId ? s?.scenes[this.sceneId] : undefined;
    if (!view || !tok || !scene) return;
    let { x, y } = view.root;
    if (scene.gridVisible) {
      const g = scene.gridSize;
      const odd = Math.round(tok.size) % 2 === 1 || tok.size < 1;
      const snap = (v: number) => (odd ? (Math.floor(v / g) + 0.5) * g : Math.round(v / g) * g);
      x = snap(x);
      y = snap(y);
    }
    x = Math.round(x);
    y = Math.round(y);
    view.root.position.set(x, y);
    view.root.cursor = 'grab';
    useGame.getState().moveTokenLocal(d.id, x, y);
    send({ type: 'token.move', id: d.id, x, y });
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const old = this.world.scale.x;
    const next = Math.max(0.05, Math.min(5, old * Math.exp(-e.deltaY * 0.0015)));
    const wx = (mx - this.world.x) / old;
    const wy = (my - this.world.y) / old;
    this.world.scale.set(next);
    this.world.position.set(mx - wx * next, my - wy * next);
  };

  /** Seitenkoordinaten eines Kartenpunkts (für Tests). */
  worldToPage(x: number, y: number): { x: number; y: number } {
    const p = this.world.toGlobal({ x, y });
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }

  center(): { x: number; y: number } {
    const { width, height } = this.app.screen;
    return this.world.toLocal({ x: width / 2, y: height / 2 });
  }

  destroy(): void {
    this.destroyed = true;
    this.app.canvas.removeEventListener('wheel', this.onWheel);
    for (const v of this.tokens.values()) v.destroy();
    this.tokens.clear();
  }
}

let current: MapRenderer | null = null;

/** Mitte des sichtbaren Kartenausschnitts in Kartenkoordinaten. */
export function mapCenter(): { x: number; y: number } | null {
  return current?.center() ?? null;
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let cancelled = false;
    let renderer: MapRenderer | null = null;
    let unsub: (() => void) | null = null;
    const app = new Application();
    void app
      .init({
        resizeTo: host,
        background: '#120f0b',
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
      })
      .then(() => {
        if (cancelled) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        renderer = new MapRenderer(app);
        current = renderer;
        (window as unknown as { __vttMap: MapRenderer }).__vttMap = renderer;
        renderer.render(useGame.getState());
        unsub = useGame.subscribe((s) => renderer?.render(s));
      });
    return () => {
      cancelled = true;
      unsub?.();
      if (renderer) {
        renderer.destroy();
        if (current === renderer) current = null;
        app.destroy(true, { children: true });
      }
    };
  }, []);

  const hasScene = useGame((s) => Boolean(shownSceneId(s) && s.scenes[shownSceneId(s)!]));
  const isGm = useGame((s) => s.me?.role === 'gm');

  return (
    <div className="map">
      <div ref={hostRef} className="map-canvas" data-testid="map" />
      {!hasScene && <div className="map-empty">{isGm ? t('noScene') : t('waitingForScene')}</div>}
      <div className="map-hint">{t('mapHint')}</div>
    </div>
  );
}
