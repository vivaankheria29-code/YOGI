# Spotify in YOGI

Open the Music tab. Its controls follow your Core, Glass or Marigold theme and custom colours.

## Play a playlist link
Paste a full https://open.spotify.com/playlist/... URL (Spotify → Share → Copy link to playlist), then choose Load playlist. Use the official embedded player's play control. The playlist is remembered in this browser. Remove player unloads it and stops its audio. Spotify determines the available playback experience; embeds may require Spotify sign-in or offer previews rather than full tracks.

## Link your account
1. Open Link your Spotify account in Music.
2. Create or choose your app in https://developer.spotify.com/dashboard. Copy its Client ID (not Client Secret).
3. Register the exact redirect URI shown in YOGI, for example http://127.0.0.1:8341/spotify/callback. It must match the running port. Enable Web API access and, for a development app, allow your Spotify account in the app's user settings.
4. Paste the Client ID in YOGI, choose Connect Spotify and approve on Spotify's site.
5. Select a playlist, open Spotify on a computer or phone, start a song there, refresh devices and choose Play on device.

Previous, Play, Pause and Next operate Spotify Connect devices, separately from the embedded player. Spotify Premium is required for device playback; developer-app eligibility and user restrictions also apply. A playlist link can be used without configuring a developer app.

## Connection and privacy
OAuth uses Authorization Code with PKCE and an expiring, single-use random state. No Client Secret is requested. Access and refresh tokens remain in the local YOGI server's memory and are never returned to the page, model or portable ZIP. Restarting the server requires reconnecting. Disconnect removes this server's session; use Spotify's account Apps page to revoke the app's authorization entirely. The Client ID and selected playlist are saved in browser storage. Loading the player contacts Spotify; no third-party player loads until a playlist is selected or a previously saved selection is opened in Music.

## Verification
The connection flow, refresh, playlist and playback errors were tested with simulated Spotify responses. Real account sign-in and full-track playback require your Client ID, authorization and eligible account; these were not exercised during development.

Official references:
- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
- https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed

## Beat-reactive faces
Choose Music → Vibe with music. In Chrome or Edge, select the tab playing Spotify and enable Share tab audio. For the Spotify desktop app, select a source offering system audio. Audio must be playing on this computer: playback on a phone or remote Spotify Connect device is not available to the local analyser.

The face nods and tilts on detected audio onsets, smiles with energy and settles in silence. The Movement slider controls strength. All three face styles use the same render-only offsets. Speaking, listening and work activity take priority; reduced motion disables the dance. Stop music vibe or the browser's Stop sharing control ends capture. No audio/video is recorded or uploaded; the video track is required by the browser capture API but its frames are never read. Capture is never automatically re-enabled after reload.

Browser support, source selection or protected playback may prevent audio capture. A missing audio track shows retry guidance; silence shows Waiting for music. Validation used generated audio with a real Web Audio analyser, not a live Spotify account or hardware capture.

Music expression mixes: energetic beat phrases blend cheerful, playful, mischievous, star-struck, shades, heart-eye, laughing and proud poses. Softer audio uses relieved and curious expressions too. Poses interpolate smoothly, fade with audio energy and respect pinned previews, activity priority and reduced motion. Five blend checks and ten browser audio checks passed using generated audio.
