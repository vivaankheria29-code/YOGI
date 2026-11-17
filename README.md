# YOGI

Personal desktop AI assistant created by **Vivaan Kheria**. YOGI combines an expressive animated face, voice chat, a file workspace, Spotify controls, and a searchable development-skill library.

## Run the portable app

Download **YOGI-Portable.zip** from [Releases](https://github.com/vivaankheria29-code/YOGI/releases/latest), extract the entire archive into a writable folder, and run:

- Windows: `START YOGI.cmd`
- macOS: `Start YOGI.command`
- Linux: `sh 'Start YOGI.sh'`

YOGI uses an installed Node.js 22+ or downloads a verified portable runtime. Choose a CLI in Settings → Your AI engine and sign in to it on your own computer. Codex remains the default, with 13 alternative headless adapters; see [CLI providers](CLI-PROVIDERS.md). Each computer uses its own account and connected services. Chrome is recommended for the existing speech-recognition integration. Windows has been tested; macOS and Linux launchers are supplied but have not been executed here.

The server listens on loopback only. This is a desktop app, not a static GitHub Pages site or a native phone app. See [START HERE.txt](START%20HERE.txt) for setup, diagnostics and supported runtime targets.

## Features

- Animated faces, expressions, lip sync, wake-word controls and custom themes.
- Streaming chat, attachment previews, inline generated images, and side-by-side file viewing/editing with format-dependent support.
- Spotify account/playlist linking and optional music-reactive face animation. Playback capabilities depend on Spotify account/device support.
- **5,750 development guidance entries:** 508 pinned GitHub skills and 5,242 custom YOGI recipes.
- The 5,000 latest additions are a matrix of focused subject/task/delivery recipes: 3,000 video animation and 2,000 3D web animation. They are not 5,000 independent upstream projects or installed rendering engines. See [recipe methodology](ANIMATION-5000.md).
- Automatic skill matching with bounded context; the newest recipes are stored separately and read on demand.

## Accounts, permissions and data

The AI backend uses the selected installed CLI and its configured model. No account, subscription or CLI installation is bundled. Codex retains its native app/tool features; alternative adapters have the capability limits documented in CLI-PROVIDERS.md. Optional ElevenLabs voice uses your own key in `.env`, copied from `.env.example`. Spotify setup is documented in [SPOTIFY-SETUP.md](SPOTIFY-SETUP.md).

YOGI currently defaults to full local tool access. Review Settings → Permissions and choose workspace-only mode if desired. Browser microphone/screen sharing and external-service consent remain controlled by their providers. Do not expose the local server directly to the internet.

Credentials, local chats, uploads, generated projects, logs, installed workspace skills and downloaded runtimes are excluded from this repository and the portable release. The bundled skill pack installs the guidance on startup; it does not automatically run skill scripts or install their external dependencies.

## Development and verification

The repository contains editable source and the portable prebuilt `server.bundle.mjs`. The launcher prefers that bundle. Source changes therefore require rebuilding it (see START HERE.txt), or removing the bundle locally and installing dependencies with `npm ci` to run the source.

```sh
node tools/verify-package.mjs
npm run check
npm start
```

The verifier checks shipped hashes, the skill-pack manifest and JavaScript syntax without signing into Codex or installing the skills. Historical validation reports are included; see [latest recipe validation](ANIMATION-5000-TESTS.json). These checks do not prove every generated recipe or every connected-service flow has been tested.

## Attribution

Bundled third-party code retains its notices in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt). Skill sources, pinned revisions, licenses and file hashes are recorded in [skill-catalog.json](skill-catalog.json), with individual notices in the skill pack. No blanket license for YOGI's own application code is granted by those third-party notices.
