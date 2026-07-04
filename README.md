# Ideaseq

Ideaseq is a planned Logseq plugin for brainstorming projects and texts with local AI agents.

The goal is to make Logseq a practical thinking workspace where an agent can use the current graph, page, block, or selected text as context, then help develop ideas, structure plans, rewrite drafts, and propose edits.

## Status

Early implementation stage. The repository contains the initial Logseq plugin scaffold and local bridge skeleton.

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

The first technical milestone is a Codex-backed MVP. Claude and other providers can be added later behind the same provider interface.

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

## Planned Architecture

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

For plugin UI development:

```bash
npm run dev
```

## License

GPL-3.0. See [LICENSE](LICENSE).
