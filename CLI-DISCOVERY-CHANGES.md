# CLI discovery update

- Detect supported CLI installations on this computer and label the selector.
- Replace hardcoded model suggestions with live catalogs, local model configuration and saved IDs.
- Discover custom API/gateway model IDs without returning credentials.
- Respect draft executable paths, preserve custom selections and reject late responses for another CLI/path.
- Add manual refresh and explicit partial/unavailable states.
- Rebuild the portable server used by the launchers.

Validation: 7 discovery tests, 8 browser dropdown groups, 5 browser activation groups, 10 CLI adapter groups and 8 shared-project groups. Tests use fixture catalogs and subprocesses; external accounts were not used for inference.

Portable integration check passed: rebuilt bundle starts without node_modules, serves the updated UI, discovers a custom model through a fixture CLI, and rejects unknown providers with HTTP 400.
