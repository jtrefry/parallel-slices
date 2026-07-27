# Cursor `/loop` prompt

This is an AI input template, not a form for the developer to complete. Ask AI
to resolve every angle-bracket placeholder from the approved plan and durable
state, then review the generated invocation before selecting Cursor's built-in
`/loop` command. The JSON run state must name `cursor`; the repository default
may name any enabled tool:

```text
Repeatedly orchestrate scheduling and worker events by following .cursor/commands/parallel-slices-next.md. The active plan is <PLAN_PATH>. Durable JSON state is <RUN_STATE_PATH>, its controller is cursor, and work is limited to <GOAL_BRANCH> and <EXACT_MILESTONE_AND_FINAL_SLICE>. Never implement slice code in the root thread. Recompute readiness from committed manifests and state, create one managed worktree per Ready Slice, and use async subagents or /multitask for exactly one fresh worker per returned worktree. Do not let /multitask invent a different split. As each worker finishes, verify its tracked gate and candidate commit from Git evidence; if its dependencies are accepted, atomically claim the goal checkout and integrate, review, state-record, and commit that candidate serially without waiting for unfinished independent workers. Recompute readiness after every accepted slice and start newly unlocked non-conflicting workers immediately. Continue after SLICE_ACCEPTED. Stop on PULL_REQUEST_READY, MILESTONE_FINISHED, BLOCKED, or FAILED. Preserve plan invariants, workspace boundaries, and non-goals; run every exact pipeline and produce required release fragments. Follow .parallel-slices/repository.json. In GitHub mode, after the one final audit push only <GOAL_BRANCH>, create or update one complete-goal pull request, and monitor CI until green. In local-only mode, never contact a remote. Never create a PR per slice, merge, push a protected branch, deploy, publish, change repository settings, contact unrelated external systems, or run production migrations. Do not continue into <EXCLUDED_LATER_PHASES_OR_WORK>.
```

Every approved multi-slice run uses this commit boundary:

```text
Commit each accepted gate-green, independently reviewed slice separately on the goal branch. The single pull request represents the complete goal and contains all slice commits.
```
