# UI merge — 5 November 2026

Merged the interface from YOGI-ui-update_1.zip into the latest 750-skill YOGI build.

Included: Core/Glass/Marigold, larger faces with dot/orb/illustrated options, expressions, docked composer, presentation transitions, cursor options, personalized colours and backgrounds, accent-sensitive wake matching, searchable connected-app rows, slash shortcuts and local playable chess.

Preserved: automatic skill matching and all 750 bundled skills, full browser conversation storage, file previews, inline generated images, upload quotas and microphone lifecycle fixes. Existing Core colour palettes migrate; each interface keeps separate light/dark colours. Panel and face colours and hex input remain editable.

This is a UI merge onto the latest backend. The upload's separate image-provider API, global skill creation/deletion, MCP installation endpoints and extra ElevenLabs account-management controls were not imported. Existing backend features continue through their existing controls; no unsupported controls are shown. No API keys, runtime conversations or uploaded user files are included in the archive.

Validation: 7 UI merge groups; 7 skill-browser groups; 14 app regression groups (including simulated wake cycles, playback echo, upload persistence, history and streaming audio); 9 automatic-skill checks. Real microphone hardware and live provider calls were not exercised.
