# Orbyt Desktop

Die Desktop-App für [Orbyt](https://orbyt.fun) – Chat, Sprachkanäle und Communities.

**Download:** <https://orbyt.fun/download>

- Läuft im Hintergrund mit Symbol in der Taskleiste und startet mit Windows
- Erkennt automatisch, welches Spiel du spielst („Spielt …“ im Profil)
- Stumm/Taub per Tastenkürzel auch mitten im Spiel: **Strg+Shift+M** / **Strg+Shift+D**
- Bildschirm teilen mit **Systemton** und eigener Auswahl (Bildschirm oder Fenster)
- Zahl für ungelesene Nachrichten auf dem Taskleisten-Symbol
- Aktualisiert sich automatisch

## Neue Version veröffentlichen

1. In `package.json` die `version` erhöhen (z. B. `1.0.1`).
2. Commit und Tag `v1.0.1` pushen → GitHub Actions baut Windows (.exe), macOS (.dmg) und Linux (.AppImage/.deb) und veröffentlicht sie als Release.
3. Installierte Apps holen sich das Update von selbst.

Lokal testen: `npm install` und `npm start`.
