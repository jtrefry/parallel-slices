# Skills

The canonical skill content. Each directory holds one skill in the open Agent
Skills format: a `SKILL.md` with `name` and `description` frontmatter, plus a
`files/` directory carrying the templates and small scripts the skill uses.

| Skill               | Use it to                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `plan-milestone`    | Plan work so it can run to completion autonomously, with ground truth and authorizations settled up front. |
| `build-parallel`    | Execute an approved plan with parallel workers in isolated git worktrees, contracts first.                 |
| `review-and-decide` | Run one independent review round, then decide every finding on the record.                                 |

Install into a project for Claude Code, Cursor, and Codex:

```bash
node scripts/install-skills.mjs /path/to/project
node scripts/install-skills.mjs /path/to/project --tools claude,cursor
```

Claude Code reads `.claude/skills/<name>/SKILL.md` natively and can invoke a
skill automatically from its description. Cursor (`.cursor/commands/`) and
Codex (`.agents/skills/` plus an `AGENTS.md` index block) get thin adapters
pointing at that same copy, so each skill has exactly one canonical text in
the target repository.
