# Sprecheranzeige: Übergabe für den Vault

Stand 2026-11-13. Momentaufnahme für die Dokumentation im Vault. Maßgeblich für Details bleibt das README im Repo.

- Repo: <https://github.com/offbeerbrawl-dev/beerbrawl_sprecheranzeige> (privat, BeerBrawl-Konto)
- Lokaler Ordner auf Mareks Gaming-PC: `E:\BeerBrawl\Dev\sprecheranzeige`
- Korken-Bilder im Drive: `Brawl Austausch\03_Stream-Bausteine\Overlays\Sprecheranzeige\Korken`

## Kurzfassung

Die Sprecheranzeige ist eine OBS-Browserquelle für die Gaming-Streams. Sie zeigt für jede Person im Discord-Sprachkanal einen Kronkorken. Wer spricht, ist farbig und etwas größer, wer schweigt, ist grau. Sie ersetzt die sieben von Hand geschalteten Korken-Bildquellen im Baustein `B | Teilnehmer` der Szenensammlung `Gaming`.

Sie läuft seit 2026-11-13 auf Mareks Gaming-PC mit dem echten Discord. Der Test mit mehreren Personen im Kanal steht noch aus.

## Wie es funktioniert

1. Auf dem Stream-PC läuft ein kleines Programm (Node.js). Es verbindet sich mit der Discord-Desktop-App auf demselben PC über deren lokale Schnittstelle (RPC über eine Named Pipe). Es gibt keinen Bot im Kanal und keinen Fremddienst.
2. Das Programm meldet sich mit der eigenen Discord-App „BeerBrawl Sprecheranzeige“ an. Diese App gehört dem BeerBrawl-Konto. Jedes Discord-Konto, das damit streamen will, muss dort als Tester eingetragen sein.
3. Discord meldet dem Programm, wer im Sprachkanal sitzt, wer kommt und geht und wer gerade spricht.
4. Das Programm liefert unter `http://127.0.0.1:4747/` eine durchsichtige Seite aus und schickt ihr jede Änderung sofort. OBS bindet diese Seite als Browserquelle ein.

Regeln der Anzeige:

- Gezeigt werden alle Personen im Kanal, in dem die Discord-App des Stream-PCs gerade sitzt. Kanalwechsel macht die Anzeige mit.
- Bekannte Personen bekommen ihren Korken in Personenfarbe. Die Zuordnung läuft über die Discord-Nutzer-ID.
- Alle anderen bekommen einen weißen Gast-Korken mit ihrem Discord-Namen. Der Name lässt sich abschalten.
- Bots erscheinen nie. Einzelne Konten lassen sich über eine Ignorierliste ausblenden.
- Es gilt allein, was Discord meldet. Wer in Discord stumm ist, bleibt grau. Es gibt keine Kopplung an das OBS-Mikrofon.
- Nach dem Sprechen bleibt der Korken noch 250 ms farbig, damit er bei Sprechpausen nicht flackert.
- Kein Kanal, Discord aus oder Programm aus: Die Anzeige ist leer und durchsichtig. Das Programm verbindet sich von selbst neu.

## Einrichtung auf einem neuen PC

Voraussetzungen: Windows, Discord-Desktop-App, Node.js ab Version 20, Zugriff auf das Repo.

Einmalig im Discord Developer Portal (BeerBrawl-Konto, Anwendung „BeerBrawl Sprecheranzeige“):

1. Das Discord-Konto, das auf dem Stream-PC angemeldet ist, unter „App Testers“ eintragen. Die Einladung mit diesem Konto annehmen.
2. Unter OAuth2 muss die Redirect-URI `http://localhost` stehen.
3. Unter OAuth2 das Client-Secret holen („Reset Secret“, Discord zeigt es nur direkt danach). Achtung: Der Public Key auf der Seite „General Information“ ist nicht das Client-Secret.

Auf dem PC:

1. Repo klonen.
2. `.env.example` nach `.env` kopieren und Client-ID und Client-Secret eintragen.
3. `Sprecheranzeige starten.bat` doppelklicken. Der erste Start installiert die Abhängigkeiten, legt `config.json` an und löst in Discord einmal die Freigabe-Abfrage aus.
4. Nutzer-IDs der Personen in `config.json` eintragen. Die IDs gibt es in Discord über den Entwicklermodus (Einstellungen, Erweitert), dann Rechtsklick auf die Person und „Nutzer-ID kopieren“. Alternativ listet `npm run who` alle im aktuellen Sprachkanal auf.
5. In OBS eine Browserquelle anlegen: URL `http://127.0.0.1:4747/`, Breite 1920, Höhe 1080, Position 0/0, nicht skalieren.

`.env`, der gespeicherte Token (`.token-cache.json`) und `config.json` bleiben lokal. Sie gehören nicht ins Repo, nicht in den Drive und nicht in den Vault.

## Im laufenden Betrieb

Vor dem Stream:

1. Discord starten und in den Sprachkanal gehen.
2. `Sprecheranzeige starten.bat` doppelklicken. Das Fenster bleibt während des Streams offen.
3. OBS starten. Lief OBS schon, die Browserquelle einmal aktualisieren.

Während des Streams ist nichts zu tun. Kanalwechsel, neue Personen und ein Neustart von Discord laufen von selbst.

Nach dem Stream das Fenster schließen oder mit Strg+C beenden.

Zum Einstellen ohne Discord gibt es den Demo-Modus mit simulierten Sprechern: `Sprecheranzeige starten.bat --demo 10`, in PowerShell `& ".\Sprecheranzeige starten.bat" --demo 10`.

## Konfiguration

Alles Personenbezogene steht in `config.json`:

- Personen mit Name, Nutzer-ID, Korken-Bild und Farbe. Die Reihenfolge der Liste ist die Reihenfolge im Bild, Gäste stehen dahinter.
- Ignorierliste, Kanal (`auto` oder feste Kanal-ID), Nachleuchten, Vergrößerung beim Sprechen, Gastnamen an oder aus.
- Position und Größe der Korken (`layout`). Eingestellt wird dort, nicht in OBS.

Änderungen gelten nach einem Neustart des Programms.

Die Korken-Bilder entstehen per Skript (`npm run korken`) aus den SVGs in `04_Marke\Logos\korken_names_and_guests` und werden dabei auf die Personenfarben umgefärbt. Bei einer Farbänderung genügt es, die Farbe in `config.json` zu ändern und das Skript laufen zu lassen. Die SVGs werden nur gelesen.

## Typische Fehlerbilder

| Bild | Ursache |
|---|---|
| Anzeige leer | Kein Sprachkanal, Discord aus oder Programm läuft nicht. Auch: nur `npm run probe` gestartet, das liefert keine Seite aus. |
| Alle als weiße Gäste | Nutzer-IDs fehlen oder stimmen nicht. |
| „Discord nicht erreichbar“ | Desktop-App läuft nicht. Das Programm verbindet sich nach dem Start von selbst. |
| 401 `invalid_client` | Falsches Client-Secret in der `.env`, oft der Public Key. |
| „Port 4747 ist belegt“ | Das Programm läuft schon. |
| Jemand bleibt grau | Die Person ist in Discord stumm, oder Discord erkennt die Sprache nicht. |

## Stand der Arbeitspakete

| Paket | Stand |
|---|---|
| AP0 Discord-App und Repo | erledigt |
| AP1 Machbarkeitstest | Anmeldung, Mitglieder und Sprech-Events mit einer Person bestätigt. Offen: zwei Personen, zweiter Start ohne Freigabe, feste Kanal-ID. |
| AP2 Brücke | erledigt, 17 automatische Tests |
| AP3 Overlay | erledigt, im Demo-Modus und in OBS angesehen |
| AP4 Korken-Grafiken | erledigt, 9 Personen und Gast |
| AP5 Start und Doku | erledigt |
| AP6 OBS und Live-Test | Browserquelle läuft bei Marek. Offen: Szenensammlung `Gaming` exportieren und ablegen, Live-Test mit mindestens zwei weiteren Leuten (Vorschlag Mi 25.11.). |

## Abweichungen vom Plan

- Das Nachleuchten beträgt 250 ms statt 500 ms. 500 ms wirkten im Test zu träge.
- Der Gastname steht nicht unter dem Korken, sondern über dessen unterem Rand. Bei y = 943 reicht der Korken schon bis zum Bildrand. Bei mehreren Gästen stehen die Namen abwechselnd eine Zeile höher.
- Bei Andy, Jan, Tobi und Lauch bleiben Schatten und Randtöne der SVG-Vorlage stehen, weil die Zielfarbe praktisch der Vorlage entspricht. Bei allen anderen ist der Schatten die Zielfarbe mal 0,77.
- Die PNGs rendert das npm-Paket `@resvg/resvg-js`, weil weder `rsvg-convert` noch Inkscape installiert sind.
- Die Schrift Bangers kommt aus dem npm-Paket `@fontsource/bangers` und wird lokal ausgeliefert.
- Die Korken-PNGs liegen zusätzlich im Repo, damit ein neuer PC ohne die SVGs auskommt.
- Scheitert die Anmeldung, beendet sich das Programm mit der Meldung von Discord und fragt nicht in Schleife nach.

## Erkenntnisse zur Discord-Schnittstelle

- RPC funktioniert für eingetragene Tester ohne Freigabe durch Discord, mit den Scopes `rpc`, `rpc.voice.read` und `identify`.
- Die Freigabe (`AUTHORIZE`) muss ohne Redirect-URI geschickt werden. Die Referenz <https://github.com/snrgarb/discord-rpc-research> beschreibt es umgekehrt, das traf bei uns nicht zu.
- Ob bei fester Kanal-ID Sprech-Events ankommen, wenn der Stream-PC nicht in diesem Kanal sitzt, ist noch nicht geprüft.
