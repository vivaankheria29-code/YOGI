# YOGI dot accessory studio

The owner uses the pencil beside YOGI or Settings → Appearance → Customize character. Guests use Character in the shared page header. Both receive the same studio, rebuilt from the supplied monochrome dot accessory reference.

## Reference collection (15)

- Hats: Cap, Beanie, Bucket hat, Fedora, Aviator hat.
- Eyewear: Round, Square, Aviators, Visor, Monocle.
- Headsets: Headphones, Gaming headset with boom microphone.
- Extras: Scarf, Bandana, Crown.

Artwork uses sampled cream dot contours and stippled textures. The cap has a stitched badge, the beanie a ribbed texture and inset patch, the aviator hat goggles and ear flaps, the scarf woven rows and fringe, and the crown jewelled tips. Every thumbnail uses a matching LED face. The studio follows the reference layout: a large live preview, ACCESSORIES title, four category controls, two full-width groups and paired Headsets/Extras groups. Mobile stacks the groups and keeps Save reachable.

Choose one item per category. Click an equipped item again or Remove to take it off. Four categories may be combined. New users start with the reference cap and square glasses. Character settings holds nickname, LED colours, shuffle and Clear outfit. Defaults are warm cream; colour controls remain optional. The preview follows the active dot/orb style; illustrated mode uses a dot preview. Original face expressions, speech and activity remain available.

Close or Escape cancels the draft. Save character applies and stores it. Owner and guest use independent local profiles. Import/export a small JSON profile to carry a character to another browser or guest address/port. Exports contain no conversations, account secrets or access codes. Storage failures leave the current page working and offer export.

Version 1 profiles migrate supported items into the replacement collection: for example Aviators and Headphones retain their equivalents, and Crown/Scarf/Bandana move to Extras. Removed cartoon items are discarded; the reference palette replaces old default colours. Version 2 profiles preserve explicit LED colours. Profiles accept only known item IDs, short text and hex colours. No arbitrary scripts, SVG uploads or external asset URLs are accepted.

Profiles are not uploaded to the host’s device roster. They belong to each browser origin; export/import is required when an address or sharing port changes.

Run npm run test:character to verify the exact reference collection, all 15 assets, colour rendering, selection, independent save/reload, migration, responsive layouts, import/export, cancellation, guest chat and CSP. Tests use isolated browser contexts and fixture answers, not real user history or paid inference.

To regenerate the baked dot artwork, run tools/design-character-art.mjs with YOGI_TEST_RUNTIME pointing at a node_modules directory containing Playwright. It regenerates public/character-art.js from the editable source geometry.
