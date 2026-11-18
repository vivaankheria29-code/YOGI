# YOGI character wardrobe

The main user can open the pencil button beside YOGI’s face or from Settings → Appearance. Guests use Character in the shared page’s header, before or after joining. Every accessory was designed as original SVG artwork before building the editor. No asset download, paid unlock or external service is required.

Pick one of six accessories per category, or None. Combine all six slots, recolour the artwork with Primary and Trim, add a nickname and optionally recolour dot/orb face details. The preview uses the active dot/orb face (illustrated mode previews accessory placement on a dot face). Existing expressions, speech and activity continue behind the outfit; accessories follow head movement. The nickname identifies the character in its editor and does not rename the account or CLI.

## Complete collection (36)

- Headwear: Orbit cap, Ribbed beanie, Little royalty, Lunar bucket, Night wizard, Space explorer.
- Eyewear: Round readers, Pixel player, Future visor, Star gazer, The professor, Cloud pilot.
- Ears and antennae: Cosmic cat, Moon bunny, Signal seeker, Signal fins, Tiny trouble, Star elf.
- Face details: Berry cheeks, Stardust freckles, Moon whiskers, Lightning mark, Heart sticker, Adventure patch.
- Collars and audio: Comet scarf, Party bow, Beat headphones, Lucky charm, Explorer bandana, Flight collar.
- Effects: Orbital trail, Pocket stars, Soft halo, Solar flares, Circuit links, Mini moons.

## Save and share

Selections remain in preview until Save character. Close or Escape cancels the draft. Surprise me mixes a random outfit; Clear outfit removes all accessories without changing colours. Export/import carries a character as a small validated JSON profile; import opens in preview and needs Save. Only known accessory IDs, short text and hex colours are accepted. Export includes no chats, account credentials or host access codes.

Owner and guest profiles use separate local browser storage keys. Guests on different devices keep independent characters. Outfits do not change the other person’s interface and are not uploaded to the host’s device roster. Storage belongs to an origin: use export/import if the guest sharing address or port changes. If browser storage fails, the character still applies on the current page and can be exported.

No arbitrary uploaded accessories, SVG, scripts or external URLs are accepted. Illustrated faces retain their existing colours; the face colour option applies to dot/orb faces. Face styles and expressions remain in their existing settings.

Run npm run test:character for owner/guest browser checks, all 36 assets, persistence, isolation, previews, import/export, chat compatibility, responsive layouts and the guest Content Security Policy. Browser tests require Playwright or YOGI_TEST_RUNTIME. They use fixture answers and isolated browser data.
