# YOGI audit fixes — 30 October 2026

All 15 audit findings have implementation changes. The portable server was rebuilt, and the current local instance is running at http://localhost:8444/.

The regression suite passed **14 groups**, covering the 15 findings and repeated wake cycles. Syntax checks passed for the app's JavaScript modules. Tests used disposable data, simulated speech, a generated MP3 tone, and fake provider responses. They did not call the live language model, send email, alter credentials, delete existing user files, or make paid ElevenLabs generation requests.

| Audit finding | Change | Verification |
|---|---|---|
| 1. Malformed requests | Validated every message/history/task/attachment shape and added a complete async HTTP error boundary. | Invalid shapes rejected in unit tests; three malformed requests returned HTTP 400 against the running bundle, which remained healthy. |
| 2. External image paths | Only image files whose resolved paths are inside the app workspace can be published. | An external dummy PNG was rejected; an internal PNG was still delivered. |
| 3. History truncation | Full conversations migrate to IndexedDB and are never sliced for persistence. The 80-message limit applies only to model context. | A 90-message legacy conversation migrated and survived reload with all 90 messages. |
| 4. Playback wake echo | Recognition checks the current spoken text, including common wake-name transcription variants, before accepting a wake activation. | Simulated playback echo was ignored by the app; a different user question still interrupted playback. This is a transcript-level guard, not a hardware acoustic echo canceller. |
| 5. Unrelated typed drafts | Wake-triggered speech uses a separate command draft; the typed draft is restored after sending or canceling. | Only the voice question was sent; the unrelated typed draft remained unsent. |
| 6. Restored voice readiness | Speech queues until audio is unlocked, with a visible Enable audio button. It no longer silently drops the queued reply. | A restored voice preference queued a reply; clicking Enable audio started real MP3 playback. |
| 7. Wrong attachment preview | Attachment lookup now uses unique persisted upload IDs, never filename/size pairs. | Two different same-name, same-size files each opened their own contents. |
| 8. Previews after refresh | Uploaded attachment IDs and conversation IDs are saved. Missing in-memory originals are fetched from the scoped server endpoint. | The earlier attachment still previewed its original text after browser reload. Older metadata is repaired only when a single unambiguous matching upload exists. |
| 9. Storage exhaustion | Conversations and tasks use transactional IndexedDB; save errors stay visible with Retry and Export controls. Pending/failed saves also warn before closing. | An injected quota failure showed a persistent warning; Retry committed the data and cleared it. |
| 10. Unbounded retained uploads | Added a 2 GB aggregate upload quota with concurrent reservation accounting, storage usage, and explicitly confirmed per-file deletion in Settings. | Quota overflow was rejected; deleting a scoped dummy file freed capacity. Deleting with the wrong conversation ID was rejected. Existing user uploads were not automatically deleted. |
| 11. Missing tasks | The server validates and includes all 100 tasks supported by the UI. | The validated context retained task 100 rather than silently limiting the list to 30. |
| 12. Hindi speech | Speech filtering accepts Unicode letters/numbers and selects Hindi browser speech when available. | Hindi-only text produced speech chunks rather than an empty queue. A paid Hindi provider request was not made. |
| 13. Identity rewriting | Removed sentence and streaming rewrites. Instructions credit Vivaan Kheria for the app and accurately distinguish OpenAI/Codex as the underlying provider. | An ordinary technical comparison and unfinished streamed text were preserved exactly. |
| 14. Stale connection status | Added asynchronous authentication rechecks and a Reconnect control which resets the engine bridge. | A controlled probe changed from signed-out to signed-in without restart. The real local Reconnect endpoint also succeeded. |
| 15. Full-audio waiting | The server forwards the provider streaming endpoint incrementally. Chrome plays MP3 chunks through MediaSource and the existing face analyser. Unsupported browsers retain a buffered fallback. | The provider generator yielded before completion, and a real generated MP3 test tone began playing before the fixture HTTP response finished. |

## Live checks

- The running server rejected malformed history, tasks, and null payloads with HTTP 400 and stayed connected.
- Reconnect succeeded; the new storage module was served successfully.
- Cross-site API calls remained blocked. Read-only top-level homepage navigation is permitted, so opening a link to the app works.
- The current Chrome page retained the existing profile/history list, showed the new settings controls, and reported no console errors.

## Practical limits

- History already removed by an older version cannot be reconstructed without a backup. This change prevents future truncation.
- Browser data remains tied to the same computer/browser/origin. The JSON export is still important before clearing browser data or moving installations; it contains chats and tasks, not attachment file bytes.
- A non-ambiguous server upload is needed to repair an old attachment whose message never stored its upload ID. Missing or ambiguous older originals require reattachment.
- Browser microphone accuracy, room noise, hardware echo, and real ElevenLabs latency still need a live-device acceptance run. The new transcript echo guard reduces a concrete self-trigger path, but is not a guarantee of always-on, speaker-independent detection.
- Chrome must stay open; browser/OS suspension or an unavailable speech service can stop recognition. Reconnection and visible failure states remain in place.
- Deleting saved uploads in Settings is permanent and requires confirmation. No existing uploads were deleted as part of these repairs.

## Implementation references

The storage design uses [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API). Audio streams from the [ElevenLabs streaming endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/stream) and uses a runtime [MediaSource format-support check](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/isTypeSupported_static), with a buffered compatibility fallback.


WAKE-WORD ACCENT AND CAPTURE UPDATE
- Recognizes common forms such as Hey Yogi, Hay Yogee, Hey Yoga, Hi Jogi,
  split "yo gee", and Hindi "हे योगी".
- Uses recognition alternatives and no longer rejects explicit wake phrases
  solely because of confidence scores or a separate microphone level meter.
- Manual dictation retains its calibrated noise filtering.
- A tone and visible "Yes, I'm listening" confirmation acknowledge activation.
- Unfinished guesses are never submitted as questions; confirmed questions are
  sent after a pause. "Heard" in Settings shows the recognizer's raw words.
- Tests covered seven phrase forms, six unrelated negative phrases, five
  complete speech flows with low confidence, and the earlier 14 repair groups.
- These are simulated speech-event tests. Try your own microphone and accent
  in Chrome; browser speech recognition still depends on its service.


FACE EXPRESSIONS UPDATE
Twelve expression presets are available: cheerful grin, laugh, wink,
surprised, curious, focused, confused, concerned, proud smile, sleepy,
heart eyes, and relieved smile.
- Settings > Appearance > Preview expression > Preview face shows each pose
  temporarily, then returns to automatic behavior.
- Listening is curious; writing is focused; failures look concerned.
- Automatic expressions follow live work activity. Idle stays calm; reply
  keywords no longer choose facial emotions.
- Audio-driven lip sync remains active during expressions.
- Reduce motion keeps workflow poses static.
- Verified all 12 previews, automatic restoration, 390/1440 px overflow,
  lip sync while winking, reduced motion, and 10 reply selection cases.


WORKFLOW-DRIVEN FACE UPDATE
The automatic face represents what YOGI is doing: listening, reading files,
searching, reasoning, writing, generating images, running tools, waiting for
approval, preparing speech, speaking, completion, and errors.
- Typed progress metadata from the engine drives each work phase.
- Completed searches/tools return to a reasoning face while results are reviewed.
- No random idle moods or reply-keyword emotion guessing.
- Manual expression previews remain in Settings.
- Only activity labels are used; private reasoning text is not displayed.
- Event-to-face tests passed, including approval, completion, error recovery,
  and calm idle after a simulated 30 seconds.

CURSOR EFFECTS
Dot Matrix cursor (concept 02): white dotted arrow with a red accent, faint red follower, dotted red hover outline, and red/white dot bursts on click. Turn off Animated cursor & click effects in Settings > Appearance. Text controls, dialogs, touch, and reduced-motion mode keep the native cursor. Browser checks passed for hover, clicking, cleanup, typing, saved settings, reduced motion, dialogs, window blur, and touch.


MICROPHONE AND WAKE REPAIR — 31 October 2026
Manual and wake capture use a single speech-recognition stream. Live dictation no longer depends on a separate noise-level meter or accent-sensitive confidence cutoff. Stop waits for confirmed results. Final words survive service restarts; stalled sessions recover and stale callbacks are ignored. Hey Yogi also activates hands-free capture after the mic button is clicked.
Ten simulated microphone/wake scenarios and all 14 app regression groups passed. Physical spoken audio was not tested. Recognition language remains English (India); the proposed automatic multilingual feature is not included.


COLOR SCHEME EDITOR — 31 October 2026
Settings > Appearance > Color scheme offers live accent, background, panel, text, and face-dot color pickers and hex fields. Original, Ice, Mint, Amber, and Violet presets are included. Palettes save automatically and separately for light/dark mode. Reset affects only the current mode. The editor flags low text contrast and remains legible for recovery. Seven browser checks passed, including persistence, invalid hex input, theme isolation, reset, color-picker changes, and phone layouts.


ADDITIONAL ANIMATIONS — 31 October 2026
Section entrances now use staggered, interruptible transitions. New messages ease in; send icons bounce subtly and buttons press down. The face has listening waves, work/search orbits, an image-creation orbit, and a completion pulse. Dialogs and composer focus have gentle transitions. New effects use the current color palette, stop or pause when inactive/hidden, and respect app/OS reduced motion. Seven browser checks passed for navigation, activity phases, reduced motion, duplicate-send protection, and phone overflow.


AUTOMATIC DEVELOPMENT SKILL LIBRARY — 31 October 2026
YOGI now includes 500 pinned GitHub skills (178 frontend, 322 backend/development) and 2,136 instruction/support/license files. Starting YOGI installs the bundled offline snapshot into workspace/.agents/skills before Codex starts. Subsequent launches verify and reuse those files; missing managed files are repaired, while user changes or conflicting folders are preserved and reported. Installation does not execute skill scripts, install package dependencies, or change global Codex skills. Settings includes a searchable skill browser with source links. The backend can find and read relevant skills on demand. See SKILL-CATALOG.md for all 500 names and source commits.
Checks passed: eight installer checks, six browser checks, four bridge checks, 14 existing app regression groups, and native Codex discovery of all 500 skills with zero parsing errors.

AUTOMATIC SKILL SELECTION — 31 October 2026
Before each development request, YOGI matches the actual user message to the installed catalog and automatically loads up to two relevant skill documents within a bounded text budget. Short follow-ups can use recent project context. The selection is refreshed on every turn, including reused conversations. Casual chat does not trigger development guidance, unrelated platforms are filtered, and explicit requests without skills are honored. The model can search/read further specialist references when needed. Startup still does not execute third-party skill scripts or install external dependencies. Eight automatic-routing and mocked-bridge checks passed without model calls.

ANIMATION SKILL EXTENSION — 31 October 2026
The library now has 750 skills: the original 500 plus eight official GSAP skills and 242 original YOGI animation recipes. The new Animation filter labels custom recipes separately from GitHub imports and links API references accurately. The installer preserves unchanged original skill content when adopting the new catalog version. Animation requests automatically load focused component recipes or GSAP guidance. The recipes cover 24 UI motion families plus accessibility/performance audits; their standalone probes demonstrate the animation primitive, not a full production component. See ANIMATION-SKILLS.md for all additions. All 750 were recognized by native Codex with zero parsing errors.


## Spotify music — 5 November 2026

Theme-matched Music tab with playlist-link embeds, session-only account linking via OAuth PKCE, playlist browsing, device selection and explicit playback controls. Separate light/dark and custom YOGI palettes apply to the surrounding controls; Spotify retains its own embedded-player branding. See SPOTIFY-SETUP.md. No Client Secret or Spotify tokens are included in the ZIP.


## Audio-reactive faces — 5 November 2026

Music → Vibe with music uses opt-in tab/system audio sharing, adaptive onset detection and energy to drive face nods, tilt and smiles across all three faces. Includes a movement slider, permission/no-audio guidance, speech/work priority, reduced-motion handling, silence decay, visibility pause and track/context cleanup. Ten browser checks passed using generated audio.


## Performance update — 5 November 2026

Adaptive face rendering, visibility-aware activity updates, bounded streaming paints, batched scroll geometry, worker-based chess, immutable versioned skill-catalogue cache, and asynchronous gzip/ETag static delivery. Local 3-second samples reduced main-thread work by about 53% in the empty-chat scenario and 42% with 300 messages; these are measurements on one machine, not external-service latency improvements. See PERFORMANCE-NOTES.md and PERFORMANCE-RESULTS.json.


## Full access — 9 November 2026

Full access is now the default for YOGI’s Codex sessions, removing repeated local command/file/network permission prompts. Settings → Permissions can restore Workspace access. Mode changes take effect on the next message, including existing conversations. Browser and service consent and the email-send confirmation remain. See ACCESS-MODE.md and ACCESS-MODE-TESTS.json.


## File workspace — 14 November 2026

Side-by-side file tabs, text/code and hex editing, preview/download, Office/archive overviews, native-app handoff, scoped saves with conflict protection, conversation links for edited files and open-file context for YOGI. Desktop splitter and phone layout reuse the active theme. Existing chats, access settings, voice and skills remain. See FILE-WORKSPACE.md for format and size limits.
