---
name: accurate-commit-message
description: Generate an accurate Git commit message strictly from staged repository changes (`git diff --cached`) and flag temporary/unimportant files that should be unstaged.
---

# Accurate Commit Message

Generate a concise Git commit message that describes **only staged changes** verified in the repository (`git diff --cached`).

## Objective

Create a commit message that is:

- Strictly grounded in **staged changes** (`git diff --cached`)
- Clear to someone reviewing the project history
- Focused on the reason and effect of the change
- Consistent with Conventional Commits
- Free from assumptions, invented details, or unstaged modifications
- Free from temporary artifacts, log dumps, or non-essential files

## Required workflow

1. Read the repository's contribution guidelines and rules when available:
   - `AGENTS.md`
   - `CONTRIBUTING.md`
   - `README.md`
   - `.gitmessage`
   - Other repository-specific instructions
2. Inspect the repository state:
   - PowerShell on Windows: wrap shell commands with cmd /c. Git Bash: run commands directly — never use cmd /c or cmd //c there.

   ```bash
   git status --short
   ```

3. **STRICT GUARD: Inspect Staged Changes ONLY**:

   ```bash
   git diff --cached --stat
   git diff --cached
   ```

   - **Strict Requirement**: Generate commit messages **ONLY for staged changes** (`git diff --cached`).
   - **Empty Staged Diff Guard**: If `git diff --cached` returns empty (no files are currently staged), **STOP immediately** and ask the user to stage their intended changes first (e.g. `git add <files>`). Do **NOT** generate a commit message for unstaged working-tree modifications.

4. **Identify Temporary or Unimportant Staged Files**:
   - Inspect staged files for temporary build outputs, log dumps (`*.log`), scratch scripts (`scratch/*`), OS metadata (`.DS_Store`, `Thumbs.db`), or local dev artifacts.
   - If temporary or non-essential files are staged, flag them in an advisory note and provide the unstage command:

   ```bash
   git restore --staged <unimportant-files>
   ```

5. Review recent commit messages to align with the repository's existing style:

   ```bash
   git log -10 --oneline
   ```

6. Identify:
   - The primary change in staged files
   - The affected component or scope
   - The user-visible or technical effect
   - Important secondary staged changes
   - Tests, specifications, or documentation staged (e.g., `docs/Changelog.md`)
7. Generate the commit message only after reviewing the actual staged diff.

## Commit format

Use Conventional Commits unless the repository specifies another format:

```text
<type>(<optional-scope>): <summary>

<optional-body>

<optional-footer>
```

### Allowed types

- `feat`: Introduces user-visible functionality
- `fix`: Corrects faulty behavior
- `refactor`: Changes implementation without changing intended behavior
- `perf`: Improves performance
- `test`: Adds or updates tests
- `docs`: Changes documentation only
- `build`: Changes build tooling or dependencies
- `ci`: Changes continuous-integration configuration
- `chore`: Performs repository maintenance
- `style`: Changes formatting without affecting behavior
- `revert`: Reverts an earlier commit

Choose the type based on the change's purpose, not merely the files modified.

## Subject rules

- Use the imperative mood: `add`, `fix`, `update`, or `remove`
- Start with a lowercase letter unless repository conventions differ
- Do not end with a period
- Keep the subject concise, preferably no more than 72 characters
- Describe the primary outcome rather than implementation trivia
- Use a scope only when it adds useful context
- Do not claim behavior that the diff does not demonstrate
- Do not mention tests unless tests are the primary change

Good:

```text
fix(auth): reject expired refresh tokens
```

Bad:

```text
Updated some authentication files.
```

## Body rules

Include a body when the subject cannot adequately explain the change.

The body should:

- Explain why the change was needed
- Summarize important behavior or architectural changes
- Mention meaningful constraints or side effects
- Wrap lines at approximately 72 characters when practical
- Avoid repeating the subject
- Avoid listing every modified file

Example:

```text
fix(auth): reject expired refresh tokens

Validate token expiration before issuing a new access token. This
prevents expired sessions from being renewed through the refresh
endpoint.
```

## Breaking changes

For a breaking change, add `!` and a footer:

```text
feat(api)!: replace offset pagination with cursors

BREAKING CHANGE: List endpoints now accept cursor and limit instead of
page and pageSize.
```

Only mark a change as breaking when the diff provides clear evidence.

## Accuracy requirements

- Never invent a ticket number, issue, test result, motivation, or effect.
- Never say tests pass unless the agent ran them successfully.
- Never infer a bug fix solely from a filename or branch name.
- Only include staged changes (`git diff --cached`).
- Distinguish staged changes from unstaged changes.
- Base a commit message strictly on staged changes when staged changes exist.
- If temporary or non-essential files are staged, recommend unstaging them (`git restore --staged`).
- If the staged diff contains unrelated changes, recommend splitting the commit.
- If the intent remains unclear after inspecting the diff, ask for context instead of guessing.

## Output format

Return:

```text
<commit message>
```

When temporary or non-essential files are detected in the staged index, add an advisory note:

> **Advisory**: The following staged files appear to be temporary artifacts or non-essential files and should be unstaged before committing:
> `git restore --staged <unimportant-files>`

When useful, also include a short verification section:

```text
Evidence:
- <verified change from the staged diff>
- <verified change from the staged diff>
```

Do not include the evidence section when the caller requests only the commit message.

## Final checklist

Before returning the message, confirm that:

- Every claim is supported by the inspected staged diff (`git diff --cached`)
- At least one change is staged in Git (otherwise stop and prompt for `git add`)
- Staged temporary/unimportant files are flagged for unstaging
- The type reflects the purpose of the change
- The scope is accurate and useful
- The summary uses imperative mood
- The summary is concise
- No issue numbers or test results were invented
- Breaking changes are clearly identified
- Unrelated changes have been flagged
