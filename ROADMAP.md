# Ideaseq Plan

## Goal

Build Ideaseq: a Logseq plugin for brainstorming projects and texts with local AI agents. Ideaseq should let users discuss, develop, rewrite, and structure ideas using the current Logseq graph as context.

The first version now has a working Codex MVP. The next work should harden the local agent workflow, editing safety, and graph context controls before adding advanced provider or MCP features.

## Current Status

### Done

- Native Logseq plugin shell with toolbar, command palette, and slash command entry points.
- Local Node.js bridge process for Codex CLI execution.
- Codex JSONL streaming into the plugin UI.
- Current page, current block, selected blocks, child blocks, and selected text context collection.
- Safe edit previews for insert-below, rewrite-block, rewrite-selection, and selected-block batch rewrite.
- Bridge health state, bridge command copy action, and offline UI.
- Graph-local session history stored in `<graph-path>/.ideaseq/sessions`.
- Session selector for resuming local Ideaseq conversations.
- Tool command event rendering for Codex `command_execution` items.
- Automatic current-page context, manual current-page attach/detach, and Follow/Lock page context mode.
- Exact mention syntax for `@page(...)`, `@block(...)`, and `@file(...)`.
- Marketplace theme mirroring into the plugin iframe.

### Remaining Near-Term Work

- Better page/block/file mention discovery UI with autocomplete.
- Richer diff rendering for multi-block and file edits.
- Native Codex thread resume if the provider API exposes stable resume semantics.
- Stronger session management: rename, delete, fork, search, compaction.
- Provider-neutral runtime layer for Claude and other providers.
- Revisit manual current-block and selected-text attachment controls after Logseq selection/cursor handling is reliable enough.

## Recommended Approach

Do not directly fork Claudian as the starting point. Claudian contains a large Obsidian-specific layer: plugin lifecycle, views, commands, editor integration, vault adapters, settings UI, and inline edit modals.

Instead, create a new Logseq plugin and use Claudian only as a product and architecture reference. Ideaseq should be implemented separately for Logseq.

Ideas worth studying:

- Provider abstraction
- Runtime/event normalization
- Prompt construction
- Session/history concepts
- Diff utilities
- Settings structure

The Logseq-specific parts should be implemented natively using Logseq's plugin APIs.

## References And Provenance

Ideaseq is inspired by [Claudian](https://github.com/YishenTu/claudian), but this repository should not copy Claudian source code.

Claudian should be treated as a reference for product direction, agent UX, and architecture tradeoffs. Ideaseq should use original Logseq-specific implementation code.

## Architecture

### 1. Logseq Plugin Frontend

Use TypeScript, Vite, and `@logseq/libs`.

Responsibilities:

- Render the chat panel/sidebar.
- Register toolbar commands.
- Register command palette actions.
- Add actions for the current block, current page, selected blocks, and selected text.
- Store plugin settings.
- Send requests to the local bridge.
- Render streaming responses and tool/event output.

Initial settings:

- Provider: `codex`.
- CLI path.
- Model.
- Sandbox mode.
- Graph path.
- Bridge port.
- Approval mode.

### 2. Local Bridge Process

Run a separate local Node.js process next to the plugin.

Responsibilities:

- Launch the Codex CLI.
- Access the filesystem.
- Manage subprocesses.
- Stream agent events back to the Logseq UI.
- Maintain sessions/history metadata.

The Logseq plugin should communicate with the bridge through HTTP or WebSocket.

Reasoning: the Logseq plugin UI should not be tightly coupled to direct `child_process`, filesystem, PTY, or long-running CLI process handling. A bridge keeps the UI layer simple and makes the runtime easier to test and evolve.

### 3. Provider Layer

Define a provider-neutral interface before implementing provider-specific behavior.

Suggested interface:

```ts
interface AgentProvider {
  sendMessage(request: AgentRequest): AsyncIterable<AgentEvent>;
  cancel(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<AsyncIterable<AgentEvent>>;
  getSession(sessionId: string): Promise<AgentSession | null>;
}
```

Provider:

- Codex via `codex exec --json`

### 4. Graph Adapter

Create a Logseq graph adapter that can provide useful context to the agent.

Responsibilities:

- Resolve the current graph root.
- Resolve the current page.
- Resolve the current block.
- Resolve selected blocks.
- Read child blocks.
- Map blocks/pages to their Markdown or Org files where possible.
- Build context payloads for prompts.

The agent's working directory should be the Logseq graph root.

## MVP Scope

### Phase 1: Codex MVP

Create a new plugin named `ideaseq`.

Features:

- Chat panel inside Logseq.
- Basic plugin settings.
- Local bridge process.
- Codex provider using:

```bash
codex exec --json --cd <graph-path> --sandbox workspace-write --ask-for-approval on-request
```

- Send user prompt plus current block/page context.
- Stream Codex JSONL events into the UI.
- Show final answer in the chat panel.
- Stop/cancel current run.

Status: implemented.

### Phase 2: Block And Text Editing

Add block-level actions:

- Ask about current block.
- Brainstorm from current block.
- Rewrite current block or selected text.
- Insert response below current block.
- Edit selected blocks.

For safety, edits should use a preview step first:

- Show proposed replacement.
- Let the user accept or reject.
- Apply the accepted edit through Logseq APIs.

Status: mostly implemented. Remaining improvements are better visual diffs, more robust selected text replacement when Logseq exposes richer editor selection metadata, and stronger validation for batch edits.

### Phase 3: Graph Context

Add richer context controls:

- Mention pages.
- Mention blocks.
- Mention graph files.
- Attach current page automatically.
- Add a visible context list in the chat UI.

Possible mention syntax:

- `@page`
- `@block`
- `@file`

Status: first pass implemented with automatic current-page context, Follow/Lock page mode, manual page attach/detach, and exact mention syntax. Remaining work is autocomplete/search UI, richer page content extraction, better file attachment discovery, and future manual block/selection attachment controls.

### Phase 4: Advanced Agent Features

Add advanced features only after the MVP is stable:

- Plan mode.
- Slash commands.
- Skills.
- MCP support.
- Multi-tab conversations.
- Session resume/fork.
- Diff renderer for Markdown and Org files.
- Tool call rendering.
- Conversation compaction.

Status: not started, except for the first session history and tool rendering foundations.

## Reference Concepts

Useful Claudian concepts to study without copying source code:

- Provider registry pattern.
- Chat runtime interface.
- Codex runtime approach.
- Stream event normalization.
- Prompt encoding.
- Session and history model.
- Diff utilities.
- Settings organization.
- Tool call display model.

## Platform-Specific Parts

These areas are platform-specific and should be implemented natively for Logseq:

- Plugin entrypoint.
- Sidebar/view lifecycle.
- Editor and selection handling.
- Vault adapter.
- Commands.
- Settings UI.
- Inline edit modal.
- File/context mention UI.
- Obsidian storage paths.
- Obsidian-specific DOM helpers.

## Key Technical Risk

The main risk is local process execution from the Logseq plugin runtime.

If Logseq does not provide stable direct access to Node.js `child_process` from the plugin UI, the plugin must rely on the local bridge process. This should be treated as the default architecture from the beginning.

The bridge design keeps Codex runtime details behind a local boundary and prevents the Logseq UI from depending on CLI process management.

## Initial Deliverables

1. New Logseq plugin scaffold.
2. Local Node bridge scaffold.
3. Codex provider using non-interactive JSON output.
4. Chat panel with streaming output.
5. Current page/block context injection.
6. Safe block edit preview and apply flow.
7. Short developer README with setup and architecture notes.

## Suggested Repository Layout

```text
ideaseq/
  package.json
  vite.config.ts
  src/
    main.ts
    ui/
      ChatPanel.ts
      Settings.ts
    logseq/
      graphAdapter.ts
      commands.ts
      settings.ts
    bridgeClient/
      client.ts
      events.ts
    shared/
      types.ts
  bridge/
    index.ts
    providers/
      codexProvider.ts
    sessions/
      sessionStore.ts
    runtime/
      processRunner.ts
  docs/
    architecture.md
```

## Near-Term Decision

Start with Codex only.

Use the bridge process from day one.

Avoid implementing all reference-product features at once. The first milestone should prove the full loop:

Logseq block/page context -> bridge -> Codex -> streamed answer -> optional text/block edit preview -> accepted change applied back into Logseq.
