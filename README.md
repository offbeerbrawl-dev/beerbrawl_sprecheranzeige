# BeerBrawl Sprecheranzeige

OBS-Browserquelle, die für jede Person im Discord-Sprachkanal einen Kronkorken zeigt. Wer spricht, ist farbig und etwas größer, wer schweigt, ist grau.

Ein lokaler Prozess verbindet sich über Discords lokale RPC-Schnittstelle mit der Desktop-App und liefert unter `http://127.0.0.1:4747/` die Overlay-Seite aus. Kein Bot, kein Fremddienst. Hintergrund und Entscheidungen stehen in [PLAN.md](PLAN.md).

## Stand

| Teil | Stand |
|---|---|
| Zustandslogik, Server, Overlay, Demo-Modus | fertig, mit Tests und im Demo-Modus angesehen |
| Korken-Grafiken | erzeugt und angesehen |
| Anbindung an Discord | geschrieben und gegen eine nachgestellte Discord-App getestet, **noch nicht mit dem echten Discord** (AP1) |

## Einrichtung auf einem neuen PC

Voraussetzungen: Windows, Discord-Desktop-App, [Node.js](https://nodejs.org) ab Version 20.

1. Repo klonen.
2. `.env.example` nach `.env` kopieren, Client-ID und Client-Secret der Discord-App „BeerBrawl Sprecheranzeige“ eintragen. Die Werte stehen im Discord Developer Portal des BeerBrawl-Kontos.
3. Das Discord-Konto, das auf diesem PC angemeldet ist, muss im Developer Portal unter „App Testers“ eingetragen sein und die Einladung angenommen haben. Sonst lehnt Discord die Anmeldung ab.
4. Im Developer Portal muss unter OAuth2 die Redirect-URI `http://localhost` stehen. Steht dort etwas anderes, denselben Wert als `DISCORD_REDIRECT_URI` in die `.env` schreiben. Beide müssen Zeichen für Zeichen gleich sein.
5. `Sprecheranzeige starten.bat` doppelklicken. Der erste Start installiert die Abhängigkeiten, legt `config.json` aus der Vorlage an und fragt in Discord einmal nach der Freigabe.
6. Nutzer-IDs eintragen, siehe unten.

`.env`, `.token-cache.json` und `config.json` bleiben lokal und stehen in `.gitignore`.

## Befehle

| Befehl | Zweck |
|---|---|
| `Sprecheranzeige starten.bat` | Normalbetrieb |
| `Sprecheranzeige starten.bat --demo 10` | Demo-Modus mit 10 Korken, ohne Discord |
| `npm run who` | listet alle im aktuellen Sprachkanal mit Nutzer-ID und Anzeigename |
| `npm run probe` | Machbarkeitstest: schreibt Mitglieder und Sprech-Events ins Terminal |
| `npm run probe -- --channel <Kanal-ID>` | dasselbe für eine feste Kanal-ID |
| `npm test` | Tests |
| `npm run korken` | Korken-Bilder neu erzeugen |

## Konfiguration (`config.json`)

| Feld | Bedeutung |
|---|---|
| `people` | Bekannte Personen in Anzeigereihenfolge: `name`, `discordId`, `image` (PNG in `overlay/korken`), `color`, `source` (SVG für das Korken-Skript) |
| `ignore` | Nutzer-IDs, die nie erscheinen, zum Beispiel das BeerBrawl-Konto |
| `channel` | `"auto"` = Kanal, in dem die Discord-App gerade sitzt, oder eine feste Kanal-ID |
| `lingerMs` | Nachleuchten nach dem Sprechen in ms, Standard 250 |
| `scale` | Vergrößerung beim Sprechen, Standard 1.15 |
| `showGuestNames` | Discord-Name unter Gast-Korken an oder aus |
| `layout` | `x`, `y`, `size`, `step` (Abstand von Korken zu Korken), `max`, `nameSize`, `nameLift` |
| `port` | Port der lokalen Seite, Standard 4747 |
| `korken` | `sourceDir` (SVG-Ordner), `copyTo` (zweite Ablage), `width` |

Nutzer-IDs eintragen: mit allen im Sprachkanal sitzen, `npm run who` ausführen und die IDs bei den Personen in `config.json` eintragen. Wer keine ID hat, erscheint als Gast mit weißem Korken. Bots erscheinen nie. Änderungen gelten nach einem Neustart.

## OBS

Browserquelle mit URL `http://127.0.0.1:4747/`, Breite 1920, Höhe 1080, an Position 0/0. Die Seite ist durchsichtig und setzt die Korken selbst unten links hin. Position und Größe stellst du über `layout` ein, nicht in OBS.

Reihenfolge beim Start: erst die Sprecheranzeige, dann OBS. War OBS zuerst da, die Browserquelle einmal aktualisieren. Danach übersteht die Seite Neustarts der Sprecheranzeige und von Discord von selbst.

Zum Ansehen im Browser gibt es `http://127.0.0.1:4747/?hintergrund` mit dunklem Hintergrund.

## Korken-Bilder

`npm run korken` liest die SVGs aus `korken.sourceDir`, färbt sie auf die Farben aus `config.json` um und schreibt je ein PNG (400 px breit) nach `overlay/korken` und nach `korken.copyTo`. Die SVGs werden nur gelesen.

- Welche Farben einer Vorlage ersetzt werden, steht in `scripts/korken-quellen.json`.
- Der Schatten ist die Zielfarbe mal 0,77. Weicht die Zielfarbe höchstens minimal von der Vorlage ab (Andy, Jan, Tobi, Lauch), bleiben Schatten und Randtöne der Vorlage stehen.
- Der Gast-Korken ist der Lauch-Korken ohne die Gruppe `schriftzug`, in Weiß.
- Neue Person: SVG ablegen, Eintrag in `korken-quellen.json` und in `people`, Skript laufen lassen, Bild ansehen.

Die PNGs liegen im Repo, damit ein neuer PC ohne die SVGs auskommt.

## Typische Fehlerbilder

| Meldung oder Bild | Ursache und Abhilfe |
|---|---|
| „Discord nicht erreichbar“ | Die Desktop-App läuft nicht. Starten, die Brücke verbindet sich innerhalb weniger Sekunden von selbst. |
| „Anmeldung bei Discord gescheitert“ | Freigabe abgelehnt, Konto kein Tester, Redirect-URI oder Scopes passen nicht. Die Meldung nennt den Fehler von Discord. Das Programm endet dann und fragt nicht in Schleife nach. |
| Freigabe-Abfrage erscheint erneut | Der Token ist abgelaufen und ließ sich nicht erneuern, oder `.token-cache.json` fehlt. Einmal bestätigen. |
| „Port 4747 ist belegt“ | Die Sprecheranzeige läuft schon, oder ein anderes Programm nutzt den Port. Dann `port` ändern und die URL in OBS anpassen. |
| Overlay leer | Kein Sprachkanal, Discord aus, oder die Sprecheranzeige läuft nicht. So gewollt. |
| Alle erscheinen als weiße Gäste | In `config.json` fehlen die Nutzer-IDs. |
| Jemand bleibt grau, obwohl er redet | Die Person ist in Discord stumm, oder Discord erkennt die Sprache nicht (Empfindlichkeit, Push-to-Talk). Es gilt allein, was Discord meldet. |

## Offene Punkte aus dem Machbarkeitstest (AP1)

Noch mit dem echten Discord zu klären, Ergebnis hier eintragen:

- [ ] Start und Stopp erscheinen für zwei Personen mit richtigem Namen (`npm run probe`).
- [ ] Ein zweiter Start kommt ohne Freigabe-Abfrage aus.
- [ ] Reichen die Scopes `rpc rpc.voice.read identify`? Die Doku nennt keine Zuordnung von Scopes zu Befehlen.
- [ ] Feste Kanal-ID, während der Stream-PC nicht in diesem Kanal sitzt (`npm run probe -- --channel <ID>`): Kommen Mitglieder an? Kommen Sprech-Events an? Vermutung: Mitglieder ja, Sprech-Events nein. Laut der Referenz kommen Beitritte und Abgänge auch für fremde Kanäle an, zu Sprech-Events sagt sie nichts.
- [ ] Liefert Discord in den Mitgliedsdaten einen globalen Anzeigenamen? Die Doku zeigt nur `nick` und `username`. Der Code nimmt den Server-Spitznamen, dann den globalen Namen, dann den Kontonamen.

## Aufbau

```
src/state.ts            Zustand: wer ist im Kanal, wer spricht, Nachleuchten, Reihenfolge
src/discord/ipc.ts      Named Pipe, Rahmung, Befehle und Events
src/discord/auth.ts     Freigabe, Token speichern und erneuern
src/discord/session.ts  Abos, Kanalwechsel, Neuverbindung
src/server.ts           HTTP und Server-Sent Events
src/demo.ts             Demo-Modus
src/probe.ts            Machbarkeitstest und "who"
overlay/index.html      Die Seite für OBS
scripts/korken.mjs      Korken-Bilder erzeugen
test/                   Tests für Zustand und Discord-Anbindung
```
