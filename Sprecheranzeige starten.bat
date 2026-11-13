@echo off
rem Startet die Sprecheranzeige. Doppelklick genuegt.
rem Demo ohne Discord:  "Sprecheranzeige starten.bat" --demo 10
title BeerBrawl Sprecheranzeige
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte Node.js LTS von nodejs.org installieren.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Erster Start: Abhaengigkeiten werden installiert ...
  call npm install --no-fund --no-audit
  if errorlevel 1 goto fehler
)

if not exist config.json (
  copy config.example.json config.json >nul
  echo config.json aus der Vorlage angelegt. Nutzer-IDs bitte noch eintragen.
)

call npm run build --silent
if errorlevel 1 goto fehler

node dist\src\main.js %*
if errorlevel 1 goto fehler
exit /b 0

:fehler
echo.
echo Die Sprecheranzeige wurde mit einem Fehler beendet. Meldung siehe oben.
pause
exit /b 1
