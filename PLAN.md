# Sprecheranzeige: Korken zeigen, wer in Discord spricht

Auftrag für Claude Code. Stand 2026-11-13, Auftraggeber: Marek. Zieltermin: lauffähig bis Mo 30.11.2026.

Repo: <https://github.com/offbeerbrawl-dev/beerbrawl_sprecheranzeige> (privat, GitHub-Konto von BeerBrawl).

## Ziel

In den Gaming-Streams von BeerBrawl ist in der Webcam nur der Streamer zu sehen. Die anderen sitzen im Discord-Sprachkanal, und Zuschauer können die Stimmen nicht zuordnen.

Gebaut wird eine OBS-Browserquelle, die für jede Person im Sprachkanal einen Kronkorken zeigt. Wer spricht, ist farbig und etwas größer. Wer schweigt, ist grau. Die Quelle ersetzt die sieben von Hand geschalteten Bildquellen im Baustein `B | Teilnehmer` der Szenensammlung `Gaming`.

## Rahmen

- Läuft nur auf Mareks Gaming-PC: Windows, OBS, Discord-Desktop-App mit Mareks Konto. Die Aufnahmestation und die Szenensammlung `Show – Vorlage` bleiben unverändert.
- Später soll auch jemand anderes damit streamen können. Deshalb nichts fest auf Marek verdrahten, alles Personenbezogene steht in der Konfiguration.
- Kein Bot, kein StreamKit, kein Fremddienst. StreamKit mit eigenem CSS ist nach mehreren Umbauten bei Discord unzuverlässig, ein Bot säße sichtbar im Kanal und bräuchte Discords Sprachverschlüsselung.
- Wenige Abhängigkeiten. Marek ist Softwareentwickler und Testingenieur (TypeScript und Playwright im Alltag) und pflegt das Werkzeug selbst weiter.
- Zugangsdaten (Client-Secret, Tokens) liegen nur lokal und kommen nie in Git, in den Drive oder in den Vault.

## Architektur

Ein lokaler Prozess mit zwei Aufgaben:

1. **Brücke zu Discord.** Verbindet sich über Discords lokale RPC-Schnittstelle (IPC, Named Pipe `\\?\pipe\discord-ipc-0` bis `-9`) mit der Desktop-App, meldet sich mit einer eigenen Discord-App an und abonniert die Sprach-Events.
2. **Overlay.** Liefert unter `http://127.0.0.1:<port>/` eine HTML-Seite aus und schickt ihr den Zustand per Server-Sent Events. OBS bindet die Seite als Browserquelle ein.

Benötigte RPC-Befehle und -Events: `AUTHORIZE`, `AUTHENTICATE`, `GET_SELECTED_VOICE_CHANNEL`, `GET_CHANNEL`, `VOICE_CHANNEL_SELECT`, `VOICE_STATE_CREATE`, `VOICE_STATE_UPDATE`, `VOICE_STATE_DELETE`, `SPEAKING_START`, `SPEAKING_STOP`.

Vorschlag für die Technik: Node.js (LTS) mit TypeScript, ohne Framework, HTTP und SSE mit Bordmitteln. Prüfe zuerst, was auf dem PC installiert ist (`node -v`). Fehlt Node, frag Marek, bevor du etwas installierst.

### Was geprüft ist und was nicht

- Laut Discord-Doku gibt es die Events, und RPC ist für den Besitzer einer App und ihre eingetragenen Tester (bis zu 50) ohne Freigabe durch Discord nutzbar.
- Selbst ausprobiert hat das bei uns noch niemand. Deshalb steht der Machbarkeitstest (AP1) vor allem anderen.
- Quellen: <https://docs.discord.com/developers/topics/rpc> und <https://github.com/snrgarb/discord-rpc-research> (Stand Oktober 2026, lauffähiges Beispiel für IPC-Framing und Anmeldung). Das Repo ist eine Referenz, kein geprüfter Code: erst lesen, dann übernehmen.

## Anforderungen (entschieden am 2026-11-13)

1. **Wer wird gezeigt:** alle Personen im Sprachkanal, automatisch. Wer den Kanal betritt, erscheint, wer geht, verschwindet (kurzes Ein- und Ausblenden, ca. 200 ms).
2. **Bekannte Personen** bekommen ihren Korken in ihrer Personenfarbe (Tabelle unten). Zuordnung über die Discord-Nutzer-ID, nicht über den Namen.
3. **Alle anderen** (Gäste, Zuschauer) bekommen einen neutralen weißen Korken. Darunter steht ihr Discord-Anzeigename, weiß mit schwarzem Schlagschatten, Schrift Bangers. Der Name lässt sich in der Konfiguration abschalten.
4. **Bots** werden nicht angezeigt. Zusätzlich gibt es eine Ignorierliste nach Nutzer-ID, zum Beispiel für das gemeinsame BeerBrawl-Konto.
5. **Sprechen:** Korken in Farbe und etwas größer (Vorschlag: Faktor 1,15). **Schweigen:** Graustufen, leicht abgedunkelt, Normalgröße. Übergang ca. 150 ms. Mehr Effekte sind nicht gewünscht.
6. **Nachleuchten:** Nach `SPEAKING_STOP` bleibt der Korken noch 500 ms aktiv, damit es bei Sprechpausen nicht flackert. Der Wert ist einstellbar.
7. **Alles kommt aus Discord,** auch der Korken des Streamers. Es gibt keine Kopplung an das OBS-Mikrofon. Wer in Discord stumm ist, bleibt grau, das ist so gewollt.
8. **Kanal:** Standard ist der Kanal, in dem die Discord-App des Stream-PCs gerade sitzt, Kanalwechsel werden mitgemacht. Wahlweise lässt sich in der Konfiguration eine feste Kanal-ID setzen.
9. **Kein Kanal, Discord aus oder Brücke aus:** Das Overlay bleibt leer und durchsichtig. Die Brücke versucht alle paar Sekunden, sich neu zu verbinden, und übersteht einen Neustart von Discord ohne Eingriff.
10. **Reihenfolge:** bekannte Personen in der Reihenfolge der Konfiguration, Gäste dahinter in der Reihenfolge ihres Beitritts. Die Reihe darf nicht springen, wenn jemand spricht (Vergrößerung aus der Unterkante heraus, der Sprecher liegt über seinen Nachbarn).
11. **Platz im Bild:** Die Leinwand ist 1920 × 1080. Bisher liegen die Korken unten links ab etwa x = 8, y = 943, je 145 px groß, etwa 95 px Abstand, also leicht überlappend. Das Overlay soll diese Anmutung treffen und bis zu 10 Korken in einer Reihe zeigen. Der Text „Heute dabei:“ bleibt eine OBS-Textquelle und gehört nicht ins Overlay.
12. **Stumm- und Taub-Symbole** gibt es in der ersten Version nicht.

### Personenfarben

| Person | Name auf dem Korken | Farbe |
|---|---|---|
| Andy | Andy | `#6D9DEB` |
| Jan | Jan | `#F6B511` |
| Marek | Marek | `#8F5BCB` |
| Sven | Sven | `#9BD93F` |
| Tobi | Tobi | `#DF0559` |
| Lorenz | Lauch | `#4FD8F0` |
| Charlotte | Memia | `#F590E0` |
| Gerri | Gerri | `#F2741F` |
| Thorben | Painted | `#20AE88` |
| Gäste und alle anderen | – | `#FFFFFF` |

Die Farben können sich noch ändern. Sie stehen deshalb in der Konfiguration, und die Korken-Grafiken lassen sich per Skript neu erzeugen.

## Konfiguration und Zugangsdaten

- `config.json`: Personen (Name, Discord-Nutzer-ID, Korken-Datei, Farbe), Reihenfolge, Ignorierliste, Kanal (`"auto"` oder Kanal-ID), Nachleuchten in ms, Vergrößerungsfaktor, Gastname an/aus, Port. Dazu eine `config.example.json` ohne echte IDs.
- `.env` (in `.gitignore`): Client-ID und Client-Secret der Discord-App. Der Token-Zwischenspeicher liegt ebenfalls außerhalb von Git.
- Ein Hilfsbefehl listet alle Personen im aktuellen Kanal mit Nutzer-ID und Anzeigename auf, damit Marek die Konfiguration ohne Entwicklermodus füllen kann.
- Die Nutzer-IDs sind nicht geheim, gehören aber nicht in ein öffentliches Repo.

## Arbeitspakete

Aufwand insgesamt ca. 6–7 h.

### AP0 Vorbereitung (ca. 35 Min., bis So 15.11.)

**Discord-App (Marek, 20 Min.):** Im Discord Developer Portal mit dem **BeerBrawl-Konto** anmelden und eine Anwendung „BeerBrawl Sprecheranzeige“ anlegen. Die App gehört damit dem BeerBrawl-Konto. Client-ID und Client-Secret notieren, unter OAuth2 die Redirect-URI `http://localhost` eintragen. Einen Bot braucht die Anwendung nicht.

Am Gaming-PC ist Mareks eigenes Discord-Konto angemeldet. Die lokale Schnittstelle lässt nur den Besitzer der App und eingetragene Tester zu. Deshalb Mareks Konto unter „App Testers“ eintragen und die Einladung mit Mareks Konto annehmen. Wer später ebenfalls damit streamt, wird genauso als Tester eingetragen.

**Repo (mit Claude Code, 15 Min.):** Diesen Ordner mit dem Repo oben verbinden. Zuerst `.gitignore` anlegen (`.env`, Token-Zwischenspeicher, `node_modules`, Build-Ausgabe), dann der erste Commit mit dieser `PLAN.md`. Hat das Repo auf GitHub schon einen Commit, zum Beispiel ein README, diesen übernehmen statt überschreiben. Kein Force-Push.

### AP1 Machbarkeitstest (ca. 1 h, bis Mi 18.11.)

Ein kleines Skript verbindet sich mit Discord, holt die Freigabe und schreibt Kanalmitglieder und Sprech-Events ins Terminal.

Fertig, wenn:
- Marek mit mindestens einer weiteren Person im Sprachkanal sitzt und für beide Start und Stopp mit richtigem Namen erscheinen.
- ein zweiter Start ohne erneute Freigabe-Abfrage in Discord auskommt (Token gespeichert und erneuert).
- geklärt ist, was bei fester Kanal-ID passiert, wenn der Stream-PC nicht in diesem Kanal sitzt. Vermutung: Mitglieder kommen an, Sprech-Events nicht. Das Ergebnis gehört ins README.

Scheitert die Anmeldung, zum Beispiel an den Scopes: anhalten und Marek die genaue Fehlermeldung zeigen. Nicht auf die Client-ID von StreamKit, auf Nutzer-Tokens oder auf einen Bot ausweichen.

### AP2 Brücke (ca. 2 h, bis So 22.11.)

Zustand aus den Events aufbauen (wer ist im Kanal, wer spricht, Nachleuchten), Kanalwechsel, Neuverbindung, Auslieferung per HTTP und SSE. Die Zustandslogik bekommt Tests mit einem nachgestellten Event-Strom.

Dazu ein Demo-Modus, der ohne Discord wechselnde Sprecher simuliert. Damit lässt sich das Layout in OBS allein einstellen.

### AP3 Overlay (ca. 1,5 h, bis So 22.11.)

HTML, CSS und etwas JavaScript in einer Seite, durchsichtiger Hintergrund, Anforderungen 1 bis 12. Im Demo-Modus mit 1, 5 und 10 Korken ansehen.

### AP4 Korken-Grafiken (ca. 1 h, bis So 22.11.)

Quelle sind die SVGs mit Namen in `G:\Meine Ablage\Brawl Austausch\04_Marke\Logos\korken_names_and_guests`, alle 1280 × 1246,4, aus Inkscape. Es sind nachgezeichnete Bitmaps: wenige große Pfade für Fläche, Schatten, Weiß und Schwarz, dazu Ebenen mit Hunderten kleiner Randstücke in Grau- und Mischtönen. Jede Datei hat ihre eigene Palette. Umfärben heißt deshalb: pro Datei Grundton und Schattenton ersetzen und die farbigen Randtöne mitziehen. Der Schriftzug steckt im schwarzen Pfad und bleibt unberührt.

| Datei (`BeerBrawI_Kronkorken_…`) | Grundton alt | Schatten alt | farbige Randtöne | Zielfarbe |
|---|---|---|---|---|
| `andy.svg` | `#6c9cea` | `#4779ca` | `#92b1ed` | `#6D9DEB` (praktisch gleich) |
| `jan.svg` | `#f5b410` | `#d59d10` | `#f7d39f` | `#F6B511` (praktisch gleich) |
| `tobi.svg` | `#df0559` | `#bc0e51` | – | `#DF0559` (gleich) |
| `marek.svg` | `#674194` | `#583483` | `#8873a7`, `#a09aa9` | `#8F5BCB` |
| `sven.svg` | `#1fad87` | `#188c6d` | `#94cfaf`, `#5ab798` | `#9BD93F` |
| `memia.svg` | `#fd86a4` | `#d76b85` | `#a49a9c` | `#F590E0` |
| `gerri.svg` | `#173d0b` | `#133209` | `#9fa29f`, `#5d645c` | `#F2741F` |
| `painted.svg` | `#007f7f` | `#006868` | `#218483`, `#619595`, `#b6c6c6`, `#ced2d2`, `#9ca7a7` | `#20AE88` |
| `lauch.svg` | `#4fd8f0` | `#3ca5b8` | – | `#4FD8F0` (schon umgefärbt) |

- Den Schattenton aus der Zielfarbe ableiten, etwa mit Faktor 0,77 auf alle Kanäle. So ist der Lauch-Korken entstanden.
- `BeerBrawI_Kronkorken_lauch.svg` ist am 2026-11-13 neu entstanden: der leere Lorenz-Korken aus `korken_blank`, umgefärbt, plus der Schriftzug, nachgezeichnet aus dem bisherigen `Korken_Lauch.png`. Der Schriftzug liegt in der Gruppe `schriftzug`.
- Weißer Gast-Korken: dieselbe Lauch-Datei ohne die Gruppe `schriftzug`, Grundton `#ffffff`, Schatten hellgrau.
- Ergebnis: ein PNG pro Person und der Gast-Korken, 400 px breit, durchsichtig, erzeugt per Skript (zum Beispiel mit `rsvg-convert` oder Inkscape auf der Kommandozeile). Die Farben kommen aus der Konfiguration, damit sich die Bilder bei einer Farbänderung neu erzeugen lassen.
- Jedes Ergebnis ansehen, bevor es als fertig gilt. Bei den Randtönen kann nach dem Umfärben ein Saum in der alten Farbe stehen bleiben.
- Ablage: neuer Ordner `G:\Meine Ablage\Brawl Austausch\03_Stream-Bausteine\Overlays\Sprecheranzeige\Korken`. Die vorhandenen Dateien in `03_Stream-Bausteine\Grafiken\Korken` und die SVGs in `04_Marke` nicht verändern.

### AP5 Start und Doku (ca. 30 Min., bis So 22.11.)

- `Sprecheranzeige starten.bat` zum Doppelklick, so wie bei den Resolve-Skripten.
- README: Einrichtung auf einem neuen PC, Konfiguration, Demo-Modus, typische Fehlerbilder (Discord läuft nicht, Freigabe abgelaufen, Port belegt).

### AP6 OBS und Live-Test (Marek, ca. 1 h, bis Mi 25.11.)

- In `B | Teilnehmer` eine Browserquelle auf die lokale Adresse legen. Die alten Korken-Bildquellen ausblenden, nicht löschen (Reserve).
- Szenensammlung `Gaming` exportieren und nach den Regeln der LIESMICH in `03_Stream-Bausteine › OBS` ablegen.
- Test im Sprachkanal mit mindestens zwei weiteren Leuten, ca. 30 Min. *Vorschlag:* Mi 25.11.
- Puffer für Nacharbeit bis Mo 30.11.

## Was nicht dazugehört

- Änderungen an der Aufnahmestation oder an `Show – Vorlage`.
- Autostart mit Windows oder OBS. Erst wenn sich der Ablauf bewährt hat.
- Blitze, Flaschen und Etiketten umfärben. Das ist eine eigene Aufgabe im Backlog.
- Vault und Notion. Die pflegt Marek mit Claude im BeerBrawl-Projekt. Liefere am Ende eine kurze Zusammenfassung, was gebaut wurde und was vom Plan abweicht.

## Entschieden nach dem ersten Entwurf (2026-11-13)

- Gast-Korken mit Discord-Namen darunter, abschaltbar.
- Für Lauch gibt es jetzt ein eigenes SVG, siehe AP4.
- Privates GitHub-Repo im BeerBrawl-Konto, siehe oben.
- Die Discord-App gehört dem BeerBrawl-Konto, Mareks Konto ist Tester, siehe AP0.
