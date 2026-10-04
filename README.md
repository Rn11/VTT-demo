# Spieltisch – ein kostenloser virtueller Spieltisch

Ein schlanker Online-Spieltisch für Rollenspielrunden (D&D 5e, Call of Cthulhu, Delta Green, Shadowdark, Mörk Borg oder eigene Systeme). Läuft im Browser, lässt sich selbst betreiben und braucht für Spieler kein Konto.

## Was er kann

- **Karten und Spielfiguren:** mehrere Szenen pro Abenteuer, Karte hochladen, Figuren ziehen, Raster mit Einrasten, Zoom und Verschieben. Die Spielleitung entscheidet, welche Szene die Spieler sehen, und kann währenddessen andere Szenen vorbereiten.
- **Geheimnisse der Spielleitung:** versteckte Figuren, private Notizen und noch nicht aufgedeckte Handouts verlassen den Server nie in Richtung der Spieler.
- **Würfeln:** `2W6+3`, `W20`, `W100`/`d%`, `4W6kh3`, `2W20kl1`, mehrere Terme; offen oder verdeckt. Gewürfelt wird auf dem Server.
- **Handouts:** Text und/oder Bild, für alle oder ausgewählte Spieler aufdecken; neue Handouts werden markiert.
- **Charakterbögen:** Vorlagen für D&D 5e, Call of Cthulhu, Delta Green, Shadowdark, Mörk Borg und „Frei“, eigene Zusatzfelder, Würfel-Knöpfe an passenden Feldern. Ohne Regelautomatik.
- **Musik und Geräusche:** Die Spielleitung spielt Musik synchron für alle ab (Pause, Wiederholen, Lautstärke) oder löst einmalige Geräusche aus. Jeder Spieler hat einen eigenen Lautstärkeregler.
- **Protokoll und Chat** für Würfe und Nachrichten.
- **Export/Import** eines Abenteuers als ZIP-Datei.
- **Beispielinhalte:** Auf Wunsch wird ein Abenteuer mit selbst erzeugter Beispielkarte und -figuren angelegt (keine fremden Bilder, keine Lizenzfragen).

Bewusst (noch) nicht enthalten: Initiative-Leiste, Messwerkzeug, Sprach-/Videochat (Discord & Co. bleiben), Nebel des Krieges, Zeichnen.

## Schnellstart (lokal)

Voraussetzung: [Node.js](https://nodejs.org) ab Version 22.13.

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen. Beim ersten Start legst du das Spielleiter-Konto an.

### Ohne Entwicklungsmodus

```bash
npm install
npm run build
npm start
```

Der Spieltisch läuft dann auf <http://localhost:3000>.

### Mit Docker

```bash
docker compose up -d
```

Der Spieltisch läuft auf Port 3000, die Daten liegen im Docker-Volume `vtt-data`.

## Demo ausprobieren

So spielst du allein beide Rollen durch:

1. Starte den Spieltisch (siehe oben) und öffne ihn im Browser.
2. Lege das Spielleiter-Konto an und dann ein Abenteuer mit Haken bei **„Mit Beispielkarte und -figuren“**.
3. Klicke **„Einladungslink kopieren“** und öffne den Link in einem **privaten Fenster** (oder einem anderen Browser). Dort bist du Spieler.
4. Probiere es aus: Figuren ziehen, im Reiter **Handouts** den Brief für alle aufdecken, im Reiter **Protokoll** würfeln, unter **Charaktere** einen Bogen anlegen, unter **Musik** eine MP3 hochladen und abspielen.
5. Achte darauf, dass der Spieler das versteckte Ungeheuer im Wasserbecken und die Notizen der Spielleitung nicht sieht.

## So wird gespielt

1. Die Spielleitung meldet sich an und legt ein Abenteuer an.
2. Über „Einladungslink kopieren“ bekommt sie einen Link, den sie an die Runde schickt (z. B. per Discord).
3. Spieler öffnen den Link, geben ihren Namen ein und sind am Tisch. Der Browser merkt sich den Zugang.
4. Wird ein Link erneuert, funktioniert der alte nicht mehr. Bereits beigetretene Spieler bleiben drin.

Browser erlauben Ton erst nach einem Klick. Deshalb gibt es oben den Knopf **„Ton an“**.

## Daten und Sicherung

Alles liegt im Ordner `data/` (in Docker unter `/data`):

- `vtt.sqlite`: Datenbank (Abenteuer, Szenen, Figuren, Handouts, Notizen, Charaktere, Protokoll)
- `uploads/`: hochgeladene Bilder und Audiodateien

Zum Sichern den Ordner kopieren, während der Server gestoppt ist. Einzelne Abenteuer lassen sich auch über „Exportieren“ als ZIP-Datei sichern. Spieler und Protokoll werden dabei nicht exportiert, und Spieler-Charaktere werden beim Import zu Nichtspielercharakteren.

Bilder werden beim Hochladen in WebP umgewandelt und auf höchstens 8192 Pixel Kantenlänge verkleinert. Erlaubt sind Bilder bis 30 MB und Audio bis 60 MB.

## Einstellungen

Über Umgebungsvariablen:

| Variable   | Standard                       | Bedeutung                                    |
| ---------- | ------------------------------ | -------------------------------------------- |
| `PORT`     | `3000`                         | Port des Servers                             |
| `HOST`     | `127.0.0.1` (Produktion: alle) | Adresse, auf der der Server lauscht          |
| `DATA_DIR` | `./data`                       | Ablage für Datenbank und Dateien             |
| `NODE_ENV` | –                              | `production` liefert den gebauten Client aus |

Hinter einem Reverse Proxy (z. B. Caddy oder nginx) muss der Proxy WebSockets für `/ws` durchreichen. Für HTTPS setzt der Server Cookies automatisch als `secure`.

## Entwicklung

```
packages/shared   gemeinsame Typen, Nachrichtenprotokoll (zod), Würfel-Parser, Bogen-Vorlagen
apps/server       Fastify + WebSocket, SQLite (in Node eingebaut), sharp für Bilder
apps/client       React + PixiJS (Karte) + Zustand (State)
e2e               Playwright-Test: Spielleitung und Spieler in zwei Browsern
```

Der Server ist die einzige Quelle der Wahrheit. Clients schicken Aktionen per WebSocket, der Server prüft Eingabe und Berechtigung, speichert und verteilt Änderungen **pro Empfänger gefiltert** (`apps/server/src/visibility.ts`).

```bash
npm run check      # Lint, Typprüfung, Unit- und Servertests
npm run e2e        # End-to-End-Test im Browser (baut vorher den Client)
npm run format     # Code formatieren
```

Alle Oberflächentexte stehen in `apps/client/src/i18n/de.ts`. Für eine weitere Sprache diese Datei kopieren und übersetzen.

## Ideen für später

- Nebel des Krieges (Bereiche aufdecken)
- Zeichnen und Markieren auf der Karte
- Englische Oberfläche
- Hosting auf einem eigenen Server mit HTTPS

## Lizenz

Noch keine Lizenz festgelegt. Bis dahin gilt: alle Rechte vorbehalten.
