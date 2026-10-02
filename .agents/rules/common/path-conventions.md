# Path Conventions

> Reference files by paths relative to the project root. Never emit a machine-specific absolute path in commands, code, docs, or tool output.

## Project-Relative, Not Absolute

The working directory is the project root. Express paths from there:

```
WRONG:   C:\Users\Sam\Sam Folder\Repository\bgr-signature\docs
WRONG:   /home/sam/repos/bgr-signature/docs
CORRECT: docs/            (or ./docs)
```

Rationale: absolute paths leak one person's local layout, break the moment the repo is cloned elsewhere or run in CI, and bury the part that actually matters.

## Forward Slashes Everywhere

Use `/` in every path you write — files, shell commands, docs, code — including on Windows:

- `docs/signature.md`, not `docs\signature.md`.
- `/` works in Git, most CLIs, Node, Python, and CI. Backslashes are shell escape characters and fail in many contexts.

## Never Hand-Build a Path

- Join segments with the language's path API (`path.join`, `pathlib.Path`, `Join-Path`), not string concatenation.
- If a path segment contains a space, quote the whole path in shell commands: `cd "Sam Folder"`. Prefer space-free paths when you create them.

## Absolute Paths: Only When a Tool Requires One

An absolute path is acceptable only when a tool genuinely needs it. Then derive it at runtime (from the working directory, `$HOME`, or a config value) — never hardcode a personal home path into a committed file, script, or doc.
