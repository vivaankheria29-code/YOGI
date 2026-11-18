# Host YOGI on your Wi-Fi

1. Launch this copy of YOGI on the computer with your configured CLI.
2. Open Settings → Host on Wi-Fi → Start Wi-Fi hosting.
3. Send your friend the displayed link and access code. If several network links appear, choose the address on the network you both use.
4. Your friend opens the link in a phone, tablet or laptop browser, enters the code, and asks a question.
5. YOGI runs the selected app-default CLI and model on your computer and streams the answer to that browser. The friend does not need a CLI or API key.

Keep your computer awake and both devices on the same local network. If Windows Firewall asks, allow Node.js on your private network. Some guest Wi-Fi networks isolate devices; use a network that allows them to connect. No router port forwarding is needed. The link is a local-network HTTP address, not an internet hosting URL.

Stop hosting disconnects guests and cancels their waiting/running requests. Starting again generates a new code and may use a different port. Hosting starts off when the YOGI server starts. Host controls and settings remain on the existing localhost app; guests get a separate question-and-answer page.

## Accounts and conversations

Guest generation uses the host’s selected app-default CLI/model and account, including API usage or subscription limits. Share the code only with people you trust: the CLI’s own permissions remain in effect. Guest Q&A disables YOGI’s connected apps, local artifact tools and automatic development skills, and uses a separate guest workspace and conversation history. Native Codex guest turns request read-only sandboxing and receive guest-only instructions. External CLI adapters receive guest-only instructions and retain their own permissions; this is not an operating-system sandbox for every external CLI. Guest requests cannot choose executables, edit host settings, browse host uploads or read the owner’s chat/project handoffs through the guest web API.

Each guest has a separate server-side conversation. New chat clears that conversation; Leave ends the guest session. Conversation text in the guest page is kept in memory and disappears on reload; the active session can still use its earlier conversation until New chat, Leave or expiry. Sessions expire after eight hours of inactivity. Guest working files, if created by the CLI, are under work/wifi-guests and are not shipped in releases.

One generation runs at a time on the host. Guest questions wait while the computer is answering another question, including a local owner question. Up to ten guest questions can wait. A guest can have one question pending at a time and can stop it from their device.

## Testing

npm run test:wifi checks network access controls, separate sessions, serial queueing, cancellation/restart and a real fixture CLI subprocess receiving a custom model ID. npm run test:wifi:browser checks the actual host controls and guest pages with two browser contexts, including the computer’s private IPv4 address and a 375px mobile viewport. Browser tests need Playwright or YOGI_TEST_RUNTIME pointing to a node_modules directory containing it. Tests use fixture answers and no paid model inference. A physical second device was not used.

## YOGI on each device

The shared link opens YOGI with the same animated dot-matrix face used on the original computer. Enter a device name and the access code to start the device’s own conversation. Its face changes between ready, queued, thinking, answering and error states.

On the original computer, the original YOGI face stays in place. One additional face appears beside it for each connected device, with that device’s name and current activity. A horizontal strip accommodates several devices on smaller screens. Leaving removes the corresponding face. Closing a device’s page removes its face after its presence heartbeat times out; returning restores it while the session is valid. These faces show generation activity, not audio lip sync.

The second device receives YOGI’s guest interface and its own conversation. Host-only settings and files remain on the original computer. Opening the shared link is required on the other device; the host cannot remotely launch another device’s browser.

The network works across Wi-Fi and Ethernet on the same local network.

## Customize the guest interface

Tap Customize on the guest page, before or after joining. Changes preview immediately and save only in that browser for that guest address. The host interface, model, account, conversations and other devices are unchanged.

Choose dark, light or system mode; Core, Glass or Marigold styling; colour presets or individual accent, background, panel, text, message bubble and face colours. Dark and light modes keep separate palettes. Add a local JPG, PNG or WebP background (up to 8 MB, resized to 1280px). Photos never upload to the host.

Adjust stacked, side or compact layout, spacing, content width, corner roundness, font and text size. Choose a dot matrix or smooth orb face, hide the face, select one of 20 expressions or follow activity, adjust face size/speed, reduce motion and hide captions. Chat options include bubbles, message times, Enter to send and automatic scrolling.

Export/import an appearance JSON profile or reset everything from Customize. Exports include the optional background photo, but no chats, access codes or account settings. Browser storage is specific to the address and port; export/import carries the look to a new host address, restarted sharing port, browser or device. If browser storage is unavailable, changes apply for the current page and can still be exported. Invalid profiles are rejected; unsupported fields are ignored. Arbitrary CSS, scripts, SVG and external background URLs are not supported.

Run npm run test:guest-appearance for schema validation and browser checks covering two-device isolation, persistence, local photos, import/export, layouts, face styles, chat controls, storage failure and guest Content Security Policy.

## Guest character

Use Character in the guest header to dress YOGI with the 15 monochrome dot accessories from the supplied reference. The owner has the same wardrobe. Save separate browser-local outfits; export/import moves them to another address. See CHARACTER-CUSTOMIZATION.md for the full collection and storage scope.
