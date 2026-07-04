# Ideaseq

Ideaseq is a Logseq plugin for brainstorming projects and texts with local AI agents.

The goal is to make Logseq a practical thinking workspace where an agent can use the current graph, page, block, or selected text as context, then help develop ideas, structure plans, rewrite drafts, and propose edits.

## Status

Version `0.2.0` is a working MVP. Ideaseq currently provides a Logseq chat panel, Codex-backed local bridge, streamed responses, command/tool output rendering, graph context injection, session history, current-page context attachments, and safe edit previews for block/text workflows.

See [ROADMAP.md](ROADMAP.md) for the current architecture and rollout plan.

## Product Direction

Ideaseq is not primarily a coding assistant. It is an agentic brainstorming tool for:

- Project ideas
- Writing drafts
- Research notes
- Product plans
- Personal knowledge graphs
- Long-form text development
- Structured thinking inside Logseq

The first technical milestone is a Codex-backed MVP. The current roadmap keeps Codex as the only provider target while the Logseq editing workflow matures.

## Core Idea

The first useful loop should be:

```text
Logseq block/page context
-> local bridge
-> AI agent
-> streamed answer
-> optional edit preview
-> accepted change applied back into Logseq
```

## Architecture

Ideaseq will use two layers:

- A Logseq plugin frontend built with TypeScript, Vite, and `@logseq/libs`.
- A local Node.js bridge process that can launch agent CLIs and stream results back to the plugin.

The bridge is intentional. It keeps the Logseq UI layer small and avoids coupling the plugin directly to subprocess, filesystem, and long-running provider runtime details.

## References

Ideaseq is inspired by [Claudian](https://github.com/YishenTu/claudian), an Obsidian plugin for working with local AI agents inside a knowledge base.

No Claudian source code is copied into this repository. Claudian is used as a product and architecture reference while Ideaseq is implemented separately for Logseq.

## Initial Provider

The first provider target is Codex through non-interactive JSON output:

```bash
codex exec --json --cd <graph-path> --sandbox workspace-write --ask-for-approval on-request
```

The bridge normalizes Codex JSONL into Ideaseq events and stores graph-local session history under:

```text
<graph-path>/.ideaseq/sessions
```

If the graph path is unavailable, it falls back to the bridge working directory.

## Versioning

Ideaseq uses SemVer while it is still pre-1.0:

- `0.x.0` marks meaningful MVP milestones or user-visible workflow changes.
- `0.x.y` marks fixes, polish, and narrow compatibility updates.
- `1.0.0` should wait until the bridge, session model, and core Logseq editing workflows are stable enough for regular use.

## Current Workflows

- Open the Ideaseq panel from the Logseq toolbar or command palette.
- Ask about the current page/block context.
- Insert generated text below the current block.
- Rewrite the current block.
- Rewrite selected text when it is found exactly once in the current block.
- Rewrite selected blocks through a JSON preview and batch apply step.
- Attach the current page manually; the current page is also attached automatically when the panel opens.
- Switch page context mode between `Follow page` and `Lock page`.
- Use exact mentions in prompts: `@page(Name)`, `@block(uuid)`, `@file(relative/path.md)`.
- Continue previous local sessions from the session selector.

## Development

Install dependencies:

```bash
npm install
```

Build the Logseq plugin and bridge:

```bash
npm run build
```

Run the bridge after building:

```bash
npm run bridge
```

From outside the plugin directory, use:

```bash
npm --prefix /path/to/ideaseq run bridge
```

Logseq plugins run in an isolated iframe sandbox, so Ideaseq cannot launch this local process directly from the plugin UI yet. When the bridge is offline, the panel shows the manual command and a copy action.

For plugin UI development:

```bash
npm run dev
```

## License

GPL-3.0. See [LICENSE](LICENSE).
