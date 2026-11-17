# Files beside chat — 14 November 2026

Choose **Files** in the chat bar, then **Open file**, or click an attachment / local file link in a reply. On desktop, the conversation stays on the left and the file workspace on the right. Drag the divider, or focus it and use arrow keys, Home and End. Open up to eight files in tabs; use arrow keys within the tab list. On narrow phones, the conversation and file pane stack and secondary actions appear under More.

## Viewing and editing
- Text, code, JSON, XML, Markdown, CSV, SVG source, subtitles and other readable UTF-8/UTF-16 files: Preview or Edit text, up to 2 MB. Ctrl+S / Cmd+S saves. Encoding BOM and standard CRLF/CR line endings are preserved.
- Markdown gets a formatted preview; CSV/TSV gets a table preview, limited to 200 rows × 50 columns. Editing retains the full source.
- Images, PDFs, audio and video use browser previews where the format/codec is supported. Video/audio content supports byte-range requests.
- DOCX, XLSX, PPTX and ZIP get bounded read-only content/archive overviews up to 16 MB. Word paragraphs, the first three Excel sheet XML parts (200 rows each), and the first nine PowerPoint slide XML parts are supported. Native formatting, images, charts, recalculated formulas and full layout are not reproduced.
- Other small binary files: choose Raw bytes / hex for exact byte inspection/editing, up to 256 KB. This is a byte editor, not a native document or 3D editor.
- Office, Blender, design files and other specialist formats: choose Open in app for full editing in their installed desktop application, or Ask YOGI to edit the working copy. A browser cannot supply a full native editor for every format. Executable files are not launched by the opener; code is opened as text.
- Files selected from the computer can be up to 100 MB. Unsupported large formats use metadata / native-app / download fallback.

## Saves and conversation
Local files and attachments save into a new working copy in YOGI’s files/edited folder; the original attachment is preserved. Existing artifact copies can save in place. Each successful save adds a clickable file link to the conversation, so it can be reopened after a browser reload.

You can hide the pane or switch tabs without losing unsaved edits in this page. These are not autosaved drafts; save or download them before closing/reloading. The page asks before leaving with unsaved edits. Discard edits is an explicit action. Close-file controls do not silently discard dirty buffers.

The current saved file reference accompanies chat requests while the pane is open, with an instruction to use it only when relevant. Unsaved edits are flagged to YOGI and are not implicitly sent as saved contents. Ask YOGI to edit inserts the exact local path into the composer; you still describe the desired change and send it. The pane refreshes after a reply when the file changed, except while you have unsaved edits.

Saving rejects a file changed elsewhere instead of overwriting the newer version. Reload after native editing. Open in app dispatches YOGI’s working copy on the computer hosting its server, which may be different from the device showing the page. It requires an installed file association/editor. Download is available when the browser or native app cannot open the format.

## Boundaries and checks
Files stay local to the YOGI server/browser; this feature does not upload them to a third-party viewer. Office overview XML is parsed without executing macros/scripts or extracting archive paths. Native opening is an explicit user action. Artifact paths are restricted to YOGI’s files folder; upload access checks the conversation. The server retains the existing host/origin checks.

Validation: 8 backend and 13 browser UI checks; existing 14 app regression groups passed. Tests cover scoped reads/saves, copy preservation, stale-save conflicts, Unicode, byte edits, archive inspection, media ranges, chat coexistence, theme/layout behavior and keyboard resizing. Desktop-app handoff uses a stub in tests; individual native editors and every browser codec were not tested. Full access settings and automatic skill-selection tests also passed.
