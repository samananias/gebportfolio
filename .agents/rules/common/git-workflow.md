# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

- **No Emojis**: Do not use emojis in commit messages or pull request titles (keeps history clean and grep-friendly).
- **Attribution**: Commits should carry no `Co-Authored-By` trailer, generated-by lines, or AI attribution footers by default unless explicitly requested. Use the **`accurate-commit`** skill for diff-grounded messages.

## Pull Request Workflow

When creating PRs:

1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
