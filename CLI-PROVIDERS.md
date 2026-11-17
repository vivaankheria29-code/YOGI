# Choose YOGI’s CLI engine

Open **Settings → Your AI engine**, choose a CLI, optionally enter a model ID, and press **Save engine**. Install and sign in to that CLI on the same computer first, using its official guide below. YOGI does not install CLIs, transfer subscriptions, read API keys, or copy authentication between providers.

**Test installation** runs only `--version`. A successful test proves the executable starts; it does not prove account, subscription, model or tool access. Other CLIs are labelled “CLI found” until they handle your request. There is no silent fallback to another CLI.

| CLI | Command discovered | Adapter | Official reference |
| --- | --- | --- | --- |
| Codex | `codex` | Native app-server, existing streaming/tool integration | [Codex CLI](https://developers.openai.com/codex/cli/) |
| Claude Code | `claude` | Print mode, streaming JSON | [CLI reference](https://code.claude.com/docs/en/cli-reference) |
| Antigravity | `agy` | Streaming JSON input/output | [Headless mode](https://antigravity.google/docs/cli/headless/) |
| OpenCode | `opencode` | `run --format json` | [Commands](https://opencode.ai/docs/cli/commands) |
| Gemini CLI | `gemini` | Headless prompt, streaming JSON | [Headless reference](https://geminicli.com/docs/cli/headless/) |
| GitHub Copilot CLI | `copilot` | Programmatic prompt, silent text | [Programmatic reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference) |
| Qwen Code | `qwen` | Headless prompt, streaming JSON | [Headless mode](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/) |
| Goose | `goose` | Instructions file, quiet response | [Running tasks](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/running-tasks.md) |
| Aider | `aider` | Message file, buffered output, automatic Git commits disabled | [Scripting](https://aider.chat/docs/scripting.html) |
| Continue CLI | `cn` | Headless prompt, silent text | [Headless mode](https://docs.continue.dev/cli/headless-mode) |
| Amp | `amp` | Execute mode, buffered output | [Execute mode](https://ampcode.com/docs/cli/execute-mode) |
| Factory Droid | `droid` | Exec, text output | [Droid Exec](https://docs.factory.com/droid-exec/overview) |
| Cline CLI | `cline` | JSON agent/result records | [CLI reference](https://github.com/cline/cline/blob/main/docs/cli/cli-reference.mdx) |
| Kimi Code | `kimi` | Non-interactive prompt, text output | [Command reference](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command) |

These are adapters to the documented headless interfaces, not bundled installations. Provider releases, platforms, authentication and permissions can differ. See the installed CLI’s `--help` and official documentation if flags are rejected. Windows npm wrappers pointing to a `.js`/`.mjs`/`.cjs` entry point or native `.exe` are resolved without launching a shell. Other shell wrappers are rejected; select the actual executable under **Executable location**. On Windows, that override must end in `.exe` or a supported JavaScript extension. The Antigravity desktop editor’s older `antigravity` command is not a substitute for the headless `agy` CLI.

## Models and accounts

Leave the model field blank to use the selected CLI’s configuration. Otherwise enter a model ID available through that CLI, not a shell command. Model IDs are provider-specific and access is checked by the CLI at run time. Configure Amp’s model in Amp itself; YOGI disables the override for that provider. Continue accepts its configured model slug. An executable path is a local file location, never a command plus arguments.

The selected ID, executable location and model ID are saved in local `data/engine.json`. They are excluded from Git and portable releases. The app-default provider choice is per YOGI installation, shared by its browser sessions. Saved chat connections and shared projects can override it per turn; see SHARED-PROJECTS.md. Changing it affects the next message and is rejected during an active reply. UI drafts for different providers remain separate while the page is open; only the saved selection persists across reloads.

## Capability boundaries

- **Codex:** preserves native connected apps, dynamic local file/skill/email tools, image inputs, approval forms, conversation reuse and workspace sandboxing. Optional model override applies to newly created native threads.
- **Other CLIs:** receive the current request envelope, up to eight recent conversation entries, relevant automatic skill guidance and attachment paths. Each turn starts a new process; YOGI does not resume another CLI’s most recent terminal session. YOGI keeps its visible chat history. Image reading depends on the CLI’s tools and model. Text adapters may buffer their output until completion, while structured adapters show supported response events.
- The existing Codex connected-app panel is unavailable for other providers; their own configured integrations remain separate. Web/app toggle instructions are passed to the adapter, but these are not a technical sandbox over an external CLI’s tools. Select Codex when its native tool controls are required.
- The alternative adapters do not expose Codex’s sandbox or approval protocol. They require YOGI **Full access**, and the CLI’s own permissions remain authoritative. YOGI does not silently add permission-bypass flags, approve a terminal prompt or weaken a managed policy. Configure tool access in the CLI itself; a denied tool may require a terminal session. External adapters are blocked when YOGI is in workspace-only mode.
- Automatic skill matching remains bounded and attaches relevant guidance without a separate request. The original library and on-demand recipe storage are unchanged. Installing the library does not install rendering engines or execute skill scripts.
- The file viewer/editor, face animation, voice output and Spotify UI remain YOGI features. Native service consent still applies.

Prompts are passed through stdin where supported. Other adapters use separate process arguments, with a private temporary request file for large prompts or file-based interfaces. The file is removed when the turn ends, fails or is canceled. There is a ten-minute execution limit, bounded output, and process-tree cancellation. The CLI itself may retain its own history according to its settings. No raw stderr is sent to the chat; open the CLI in your terminal to diagnose sign-in/model/permission failures.

## Validation

`node tools/test-cli-providers.mjs` exercises all thirteen external adapters with real fixture subprocesses, output decoding, failure/cancellation, model arguments, settings persistence and the native Codex thread interface. `CLI-UI-TESTS.json` records isolated real-server/browser tests. No paid AI requests or external-provider sign-ins were performed. Codex and OpenCode version probes succeeded on the development machine; a locally present Claude executable could not start. The other provider binaries/accounts were not available for live testing. These results do not claim all accounts or provider versions have been end-to-end tested.
