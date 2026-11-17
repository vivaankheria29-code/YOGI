# YOGI access mode — 9 November 2026

YOGI now defaults to Full access, as requested. Its Codex sessions use `sandbox: danger-full-access` and `approvalPolicy: never`, so local commands, file operations and network access do not require repeated engine approvals. This permits operations with the current Windows user's access; it does not grant administrator privileges or remove managed-policy restrictions.

Settings → Permissions → YOGI access switches between:
- Full access: no local approval prompts.
- Workspace: workspace-write sandbox and on-request extra access.

The setting is stored locally in `data/access-mode.json`, excluded from portable archives. Changes apply to the next message and invalidate the old conversation's cached permissions. It cannot change in the middle of a reply. Invalid stored settings fall back to Workspace mode.

Browser microphone/screen/audio sharing, Spotify and other account sign-ins, required connected-service consent, and the existing one-time email-send confirmation remain. These are not silently accepted or spoofed. Questions asking for missing task information remain too.

This changes YOGI only, not the permissions of the Codex desktop chat used to develop it. Full access does not authorize unrelated actions beyond the user's actual request.

Verification: five behavior checks and four browser UI checks passed. The installed Codex runtime accepted the native full-access/never configuration; the test started no model turn and executed no command. Automatic skill matching checks also passed.

Official documentation: https://learn.chatgpt.com/docs/sandboxing and https://learn.chatgpt.com/docs/app-server
