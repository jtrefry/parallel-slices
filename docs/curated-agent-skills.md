# `nextjs-gcp-postgres` curated agent skills

The bundled `nextjs-gcp-postgres` package installs a deliberately small, immutable subset
of Vercel's [agent-skills](https://github.com/vercel-labs/agent-skills) into
newly generated applications. Skills are advisory instructions copied into
every enabled Cursor, Codex, and Claude Code native directory. They do not
replace project requirements, security rules, architecture decisions, or
quality gates. Other architecture packages select and review their own skills,
or install none.

## Reviewed source

| Property         | Value                                      |
| ---------------- | ------------------------------------------ |
| Repository       | `vercel-labs/agent-skills`                 |
| Commit           | `f8a72b9603728bb92a217a879b7e62e43ad76c81` |
| Review date      | 2026-07-15                                 |
| Declared license | MIT                                        |

The upstream README and selected skill frontmatter declare MIT. The reviewed
commit does not contain a root `LICENSE` file, so the generated third-party
inventory preserves the exact source, commit, skill-level license declaration,
and content hash rather than inventing attribution terms that are absent
upstream.

## Default selection

| Skill                    | Decision | Reason                                                      |
| ------------------------ | -------- | ----------------------------------------------------------- |
| `react-best-practices`   | Include  | Strong React and Next.js performance and correctness rules  |
| `composition-patterns`   | Include  | Scalable React component APIs and React 19 patterns         |
| `web-design-guidelines`  | Exclude  | Fetches mutable remote instructions every time it runs      |
| `writing-guidelines`     | Exclude  | Fetches mutable rules and imposes Vercel's product voice    |
| `react-view-transitions` | Exclude  | Specialized capability, not a universal application need    |
| `react-native-skills`    | Exclude  | Outside the Next.js web application scope                   |
| `deploy-to-vercel`       | Exclude  | Conflicts with the Google Cloud deployment boundary         |
| `vercel-cli-with-tokens` | Exclude  | Introduces unrelated credentials and external mutations     |
| `vercel-optimize`        | Exclude  | Uses Vercel runtime, billing, and observability assumptions |

Some selected performance examples discuss Vercel services. They remain
examples, not platform decisions. The generated root `AGENTS.md` explicitly
makes the approved Google Cloud architecture and project rules authoritative.

## Installation safety

The package does not run `npx skills add`. That command installs the complete
upstream collection, and the skills CLI enables anonymous telemetry by default.
Instead, the included installer:

1. fetches one full Git commit SHA directly with Git;
2. checks each selected directory against a committed SHA-256 tree digest;
3. accepts only Markdown and JSON, with no scripts, symlinks, or large files;
4. copies only the two approved skills into all enabled native directories;
5. records source and license metadata beside each installed skill;
6. refuses to overwrite unmanaged or locally modified skills; and
7. writes `THIRD_PARTY.md` beside each tool's skills for provenance.

Native destinations are `.cursor/skills/`, `.agents/skills/`, and
`.claude/skills/`. The universal profile enables all three destinations. An
explicit programmatic `agent` argument remains available for repairing one
managed native copy.

New-project bootstrap runs this installer while the project is still in its
temporary staging directory. A fetch or validation failure aborts the complete
bootstrap and leaves no partial target repository.

Existing repositories can install the same reviewed selection after installing
the Parallel Slices control layer:

```bash
node scripts/parallel-slices/install-curated-skills.mjs /absolute/path/to/repository
```

## Updating the pin

An upstream update is never automatic. To update it:

1. inspect all changes between the old and proposed commits;
2. review the complete selected skill directories and the upstream skill list;
3. confirm selected skills contain only static guidance and still fit GCP;
4. update the commit, review date, and both tree hashes in
   `.parallel-slices/curated-skills.json`;
5. run the real pinned-source installation check and all repository tests; and
6. publish the change through the normal protected-branch review process.

The installer updates an existing curated skill only when its provenance marker
is present and its current content still matches the previously recorded hash.
Local modifications stop the update for manual review.
