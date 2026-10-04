import { expect, test, type Page } from '@playwright/test';

/*
 * Durchspielt einen Spielabend mit Spielleitung und einem Spieler in zwei getrennten Browsern.
 */

type StoreState = {
  tokens: Record<string, { id: string; name: string; x: number; y: number; hidden: boolean }>;
  handouts: Record<string, { title: string }>;
  notes: Record<string, unknown>;
  audio: { assetId: string | null; playing: boolean } | null;
  adventure: { activeSceneId: string | null };
  scenes: Record<string, { name: string }>;
};

type MapHelper = { worldToPage(x: number, y: number): { x: number; y: number } };
const toPage = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => (window as unknown as { __vttMap: MapHelper }).__vttMap.worldToPage(px!, py!),
    [x, y],
  );

const state = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __vtt: { getState(): unknown } }).__vtt.getState(),
  ) as Promise<StoreState>;

/** Kurze stille WAV-Datei als Testmusik. */
function silentWav(seconds = 2, rate = 8000): Buffer {
  const samples = seconds * rate;
  const buf = Buffer.alloc(44 + samples);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples, 40);
  buf.fill(128, 44);
  return buf;
}

test('Spielleitung und Spieler spielen gemeinsam', async ({ browser }) => {
  const gmCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const pageErrors: string[] = [];
  gm.on('pageerror', (e) => pageErrors.push(`SL: ${e.message}`));

  // Einrichtung und Abenteuer mit Beispielinhalten
  await gm.goto('/');
  await gm.getByLabel('Name').fill('Leitung');
  await gm.getByLabel(/Passwort/).fill('geheim123');
  await gm.getByRole('button', { name: 'Konto anlegen' }).click();
  await gm.getByLabel('Name des Abenteuers').fill('Die Gruft');
  await gm.getByRole('button', { name: 'Anlegen', exact: true }).click();
  const invite = (await gm.getByTestId('invite-url').textContent())!;
  await gm.getByRole('button', { name: 'Öffnen' }).click();
  await expect(gm.locator('canvas')).toBeVisible();

  // Spieler tritt per Link bei
  const pCtx = await browser.newContext();
  const player = await pCtx.newPage();
  player.on('pageerror', (e) => pageErrors.push(`Spieler: ${e.message}`));
  await player.goto(new URL(invite).pathname);
  await player.getByLabel('Dein Name').fill('Alex');
  await player.getByRole('button', { name: 'Beitreten' }).click();
  await expect(player.locator('canvas')).toBeVisible();
  await expect(gm.locator('.presence')).toContainText('Alex');

  // Versteckte Figur und SL-Notizen erreichen den Spieler nicht
  await expect.poll(async () => Object.keys((await state(player)).tokens).length).toBe(2);
  const pState = await state(player);
  expect(Object.values(pState.tokens).some((t) => t.name === 'Lauerndes Ungeheuer')).toBe(false);
  expect(Object.keys(pState.notes)).toHaveLength(0);
  expect(Object.keys((await state(gm)).tokens)).toHaveLength(3);

  // Spielleitung zieht die Heldin per Maus; der Spieler sieht die neue Position
  const hero = Object.values((await state(gm)).tokens).find((t) => t.name === 'Heldin')!;
  await gm.waitForTimeout(500); // Bilder laden lassen
  const from = await toPage(gm, hero.x, hero.y);
  const to = await toPage(gm, hero.x + 140, hero.y + 70);
  await gm.mouse.move(from.x, from.y);
  await gm.mouse.down();
  await gm.mouse.move(to.x, to.y, { steps: 8 });
  await gm.mouse.up();
  await expect
    .poll(async () => {
      const t = (await state(player)).tokens[hero.id]!;
      return [t.x, t.y];
    })
    .toEqual([hero.x + 140, hero.y + 70]);

  // Handout aufdecken
  await gm.getByRole('tab', { name: 'Handouts' }).click();
  await gm.getByLabel('Sichtbar für').selectOption('all');
  await expect(player.getByRole('tab', { name: /Handouts/ })).toContainText('1');
  await player.getByRole('tab', { name: /Handouts/ }).click();
  await expect(player.getByTestId('handout')).toContainText('Ein zerknitterter Brief');
  await player.getByTestId('handout').click();
  await expect(player.getByRole('dialog')).toContainText('Wasserbecken');
  await player.keyboard.press('Escape');
  await expect(player.getByRole('dialog')).toHaveCount(0);

  // Würfeln: offen sehen alle, verdeckt nur SL und Werfender
  await player.getByRole('tab', { name: 'Protokoll' }).click();
  await player.getByLabel('Würfeln', { exact: true }).fill('2W6+3');
  await player.getByRole('button', { name: 'Würfeln', exact: true }).click();
  await gm.getByRole('tab', { name: 'Protokoll' }).click();
  await expect(gm.getByTestId('log-entry')).toHaveCount(1);
  const total = Number(await gm.getByTestId('roll-total').first().textContent());
  expect(total).toBeGreaterThanOrEqual(5);
  expect(total).toBeLessThanOrEqual(15);
  await gm.getByLabel('verdeckt').check();
  await gm.getByRole('button', { name: 'W20' }).click();
  await expect(gm.getByTestId('log-entry')).toHaveCount(2);
  await player.waitForTimeout(400);
  await expect(player.getByTestId('log-entry')).toHaveCount(1);

  // Charakterbogen: Spieler legt eigenen Charakter an, SL sieht ihn
  await player.getByRole('tab', { name: 'Charaktere' }).click();
  await player.getByRole('button', { name: /Neuer Charakter/ }).click();
  await player.getByLabel('Bogen-Vorlage').selectOption('morkborg');
  await player.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await player.getByTestId('character').click();
  await player.getByLabel('Stärke').fill('-2');
  await player.getByLabel('Stärke').blur();
  await player.keyboard.press('Escape');
  await gm.getByRole('tab', { name: 'Charaktere' }).click();
  await expect(gm.getByTestId('character')).toContainText('Alex');

  // Musik: SL lädt eine Datei hoch und spielt sie ab; der Spieler bekommt den Zustand
  await gm.getByRole('tab', { name: 'Musik' }).click();
  const chooser = gm.waitForEvent('filechooser');
  await gm.getByRole('button', { name: 'Hochladen' }).click();
  await (
    await chooser
  ).setFiles({ name: 'Taverne.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await expect(gm.getByTestId('track')).toContainText('Taverne');
  await gm.getByRole('button', { name: 'Abspielen: Taverne' }).click();
  await expect.poll(async () => (await state(player)).audio?.playing).toBe(true);
  expect((await state(player)).audio?.assetId).toBeTruthy();
  await player.getByRole('button', { name: /Ton an/ }).click();

  // Szenenwechsel: Spieler sehen nur die neue, leere Szene
  await gm.getByRole('tab', { name: 'Szene' }).click();
  await gm.getByLabel('Name der Szene').fill('Taverne');
  await gm.getByRole('button', { name: '+ Neue Szene' }).click();
  await gm.getByRole('button', { name: 'Den Spielern zeigen' }).first().click();
  await expect
    .poll(async () => Object.values((await state(player)).scenes).map((s) => s.name))
    .toEqual(['Taverne']);
  expect(Object.keys((await state(player)).tokens)).toHaveLength(0);
  await expect(player.locator('.topbar')).toContainText('Taverne');

  expect(pageErrors).toEqual([]);
});

test('ohne Einladung kein Zugang', async ({ page }) => {
  await page.goto('/a/gibtesnicht');
  await expect(page.getByText('keinen Zugang')).toBeVisible();
  await page.goto('/join/falsch');
  await expect(page.getByText('ungültig')).toBeVisible();
});
