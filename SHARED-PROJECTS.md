# One project, multiple CLIs and models

YOGI separates the project you are working on from the CLI/model connection answering the next message. You can use Codex to implement a feature, ask Claude to review it in the same conversation, then return to Codex with the review available in its next turn.

## Save your connections

1. Open Settings. Choose a CLI, optional model ID and executable location in the **App default engine** form.
2. Under **Shared projects & model connections**, give the connection a name such as “Codex builder” and press **Save chat connection**. This saves those fields independently; it does not change the app default.
3. Repeat for Claude or another CLI. You can save several models for one CLI, up to 32 saved connections. The models must be available through your own CLI/account. The existing CLI install, sign-in and permission limits still apply.

Use Edit on a saved connection to load its fields, then save the chat connection to update it. **Save app default** changes only the default used by chats that choose “App default.” Existing saved connections keep their own settings. YOGI stores executable locations and model IDs, not authentication secrets. CLI accounts remain signed in through their own tools.

## Choose a shared project

Expand **Project folder & shared brief**. Create a project name and either enter an absolute path to an existing project directory or leave it blank for a new folder under `workspace/files/projects/`. Linking an existing directory does not copy or replace its files. Project paths cannot be changed on an existing record; create another project to link another folder.

The shared brief is permanent, editable project context. Put the goal, constraints, decisions, test commands and next steps there. Select the project beside the chat box. All selected CLIs execute in that exact project directory while YOGI keeps its attachment/artifact workspace separate. Existing “YOGI workspace” chats remain compatible.

External project folders require YOGI Full access. Codex retains its workspace sandbox for managed project folders; other CLI adapters require Full access and retain their own permissions. YOGI does not add provider permission-bypass flags. A linked folder is edited in place. The file pane continues to preview YOGI-owned uploads and artifacts; linking a project does not expose an arbitrary external directory through file-download endpoints.

## Switch models in one chat

Choose a saved connection in the **Model** dropdown beside the composer before sending each message. Your visible chat stays intact. Answers show the connection label, requested model configuration (or “CLI default”) and project name. Project/model choices are saved with each chat in the browser.

Each turn receives the current request, available recent conversation context and the project handoff. The handoff includes:

- Project name, exact directory and saved brief.
- A bounded inventory of filenames and available Git status, without reading file contents or credentials.
- Recent attributed requests/results from models working on that project, including completed, failed or interrupted status.

The project journal retains 16 recent turn records; the prompt includes up to six compact handoffs. This is bounded shared context, not a complete model-memory transfer or a semantic summary of every decision. Keep lasting decisions in the brief and project documentation. Models are told to inspect current files and verify previous models’ reports before changing code. Other projects’ journals are not included.

Native Codex sessions are cached separately by execution configuration and project. Returning to a cached Codex session still attaches the latest handoff, so another model’s intervening work is visible. External CLIs continue to start a headless process for each turn and receive the shared context explicitly. YOGI does not import unrelated terminal sessions or copy one provider’s private reasoning into another provider.

## Optional Auto routing

Assign saved connections to **Quick questions**, **Planning & reasoning**, **Coding & fixes** and **Review & checks** in Settings. Then select **Auto · my routes** beside the composer.

Auto matches task words to those routes; it does not benchmark models, infer account prices or guarantee the objectively best model. An unassigned route explicitly uses the app default. A selected/assigned connection that cannot run reports an error instead of silently substituting another provider. Manual selection always lets you choose a different model for the next message.

YOGI runs one editing turn at a time to avoid competing writes from its own sessions. This does not lock out edits made by external terminals or editors. Save external edits before asking another model to continue.

## Storage and portability

Saved connections, project folders, briefs, routes and handoffs live in local `data/collaboration.json`. Browser chat history and per-chat selections remain in IndexedDB. The server-side journal survives restarting YOGI and can provide context to another chat linked to the same project. Because a project’s journal is shared across its linked chats, use separate projects for work that must stay separate.

Local project data and credentials are excluded from Git and portable ZIPs. Moving a project to another computer still requires moving its actual files and setting up that computer’s CLI accounts. Removing a saved connection removes its Auto assignments; it does not delete project files or sign out the CLI account.

## Validation

`node tools/test-shared-projects.mjs` verifies saved profiles, routing, storage, project isolation, session separation, bounds and folder access. `SHARED-CHAT-TESTS.json` records real HTTP/browser tests using a fixture Codex app-server and Claude subprocess: Codex changes a linked project file, Claude receives the file and handoff, then the reused Codex thread sees Claude’s review. These tests do not make paid requests or establish end-to-end compatibility with every live CLI/model/account.

## Applying a model choice

Selecting a CLI/model in the settings form edits a draft. **Use for this chat** saves/reuses that connection and selects it in the current chat. **Save app default** changes the default; it does not override an explicitly selected chat connection. If Auto has no assignments, the composer explicitly says it will use the saved app default. A suggested model does not install or authenticate its CLI.
