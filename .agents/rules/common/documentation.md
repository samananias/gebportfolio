---
paths:
  - "**/*.md"
  - "**/docs/**"
  - "**/README*"
  - "**/CHANGELOG*"
---

# Documentation Style

> Only applies to documentation work (READMEs, guides, help text, changelogs, PR descriptions). Default to plain language; keep technical depth only where it earns its place.

## Audience First

- Write for a developer who has never seen this project — they should be able to act without prior knowledge of internals.
- State what something does _for the reader_ before any jargon.
- One audience per document. If a doc serves both users and internals, split it into two.
- Lead each document or section with the outcome: "After reading this you can …".

## Simplify by Default

- Prefer the short everyday word when it means the same thing: "get" over "retrieve", "use" over "utilize", "error" over "exceptional condition".
- Define a technical term in one sentence on first use, then use it consistently — never introduce synonyms.
- One idea per paragraph; split sentences longer than ~25 words.
- No marketing filler: "blazing", "seamless", "cutting-edge", "modern" say nothing — delete them.
- A working example beats three paragraphs of prose: show the command, the snippet, or the screenshot first, then explain.
- Steps are numbered lists; each step is one observable action with the exact command or file named.

## Keep It Technical When It Must Be

Simplicity is the default, not a mandate. Keep precise technical language when:

- **Reference material** — flags, config keys, API contracts, error codes: precision beats plainness.
- **Safety and performance notes** — where a vague wording could cause a wrong or dangerous action.
- **The reader is specialists doing a precise task** — e.g. migration guides, protocol docs.

Litmus test: **if simplifying would change what a correct reader does, keep the technical version.**

## Editing Pass

When trimming existing docs:

1. Delete sentences that don't help the reader act.
2. Replace jargon only where a plain word carries the same meaning — not where it loses precision.
3. Verify a newcomer can complete the first task using only the document.
