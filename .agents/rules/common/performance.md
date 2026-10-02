# Performance Optimization

## Model Selection Strategy

**Haiku** (90% of Sonnet capability, 3x cost savings):

- Lightweight agents with frequent invocation
- Pair programming and code generation
- Worker agents in multi-agent systems

**Sonnet** (Best coding model):

- Main development work
- Orchestrating multi-agent workflows
- Complex coding tasks

**Opus** (Deepest reasoning):

- Complex architectural decisions
- Maximum reasoning requirements
- Research and analysis tasks

## Context Window Management

Avoid last 20% of context window for:

- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:

- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Extended Thinking + Plan Mode

Extended thinking is enabled by default, reserving up to 31,999 tokens for internal reasoning.

Control extended thinking via:

- **Toggle**: Keyboard shortcut or agent model settings
- **Config**: Configure thinking or reasoning budget in your agent settings
- **Budget cap**: `export MAX_THINKING_TOKENS=10000` (bash) or `$env:MAX_THINKING_TOKENS = "10000"` (PowerShell)
- **Verbose mode**: View intermediate thinking output

For complex tasks requiring deep reasoning:

1. Ensure extended thinking is enabled for complex architectures
2. Use plan mode / implementation plans for structured approaches
3. Review and critique plans before executing code changes

## Build Troubleshooting

If build fails:

1. Inspect the primary compilation or bundling error trace
2. Fix root causes incrementally
3. Re-run builds or test suites after each fix to verify resolution
