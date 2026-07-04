# Agent Instructions

## Project

Ideaseq is a Logseq plugin for brainstorming projects and texts with local AI agents.

The product is not primarily a coding assistant. It is an agentic thinking tool for project ideas, writing drafts, research notes, structured planning, and text development inside Logseq.

## Read First

Before making changes, read:

- `README.md`
- `ROADMAP.md`

## Architecture Direction

- Build a native Logseq plugin with TypeScript, Vite, and `@logseq/libs`.
- Use a local Node.js bridge process for provider runtimes, CLI subprocesses, filesystem access, and long-running sessions.
- Keep the Logseq UI layer small and avoid coupling it directly to `child_process`, filesystem, PTY, or provider-specific runtime details.
- Start with Codex as the first provider.
- Add Claude and other providers behind a provider-neutral bridge interface later.

## References And Provenance

- Claudian is a product and architecture reference only.
- Do not copy Claudian source code into this repository.
- Implement Logseq-specific behavior natively.

## Licensing

This project is licensed under GPL-3.0.

When adding source files, keep the license choice in mind. Add file headers only if the project establishes that convention later.

## Git Workflow

- Do not commit unless the user explicitly asks for a commit.
- Keep commits focused and signed.
- Do not stage unrelated files.
- Before committing, inspect `git status` and the relevant diff.
- After pushing, verify that the working tree is clean.

## Documentation

- Keep project docs concise.
- Update `ROADMAP.md` when architecture, scope, provider strategy, or product direction changes.
- Update `README.md` when setup, status, or public-facing positioning changes.
