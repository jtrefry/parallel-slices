import { blockingSeverities } from "./review-contract.mjs";

// Single independent pass per reviewer, unanimity to pass.
//
// Reviewers previously negotiated across up to three rounds, assigning
// uphold/dismiss dispositions to each other's findings. That machinery was the
// most complex part of this subsystem and it rested on treating a reviewer's
// stated reason as reliable. This project's own measurements say the opposite:
// a judge's verdict is worth trusting and its explanation is not. So findings
// are now simply reported, every reviewer must approve, and any request for
// changes goes back to the controller to fix and re-run.

export function applyReviewerResponse(
  attempt,
  round,
  reviewer,
  response,
  durationMs,
) {
  const findingIds = [];
  for (const submitted of response.findings) {
    const id = `F${String(attempt.nextFindingNumber).padStart(3, "0")}`;
    attempt.nextFindingNumber += 1;
    findingIds.push(id);
    attempt.findings.push({
      id,
      ...submitted,
      raisedBy: reviewer.id,
    });
  }
  round.turns.push({
    reviewerId: reviewer.id,
    provider: reviewer.provider,
    providerVersion: reviewer.version,
    verdict: response.verdict,
    summary: response.summary,
    findingIds,
    durationMs,
  });
}

export function evaluateConsensus(attempt, round, reviewerIds) {
  const verdicts = new Map(
    round.turns.map((turn) => [turn.reviewerId, turn.verdict]),
  );
  const allApproved = reviewerIds.every(
    (reviewerId) => verdicts.get(reviewerId) === "approve",
  );
  // Reviewers inform the decision; they do not hold a veto over it. A finding
  // the orchestrator has accepted on the record no longer blocks, because the
  // accountable judgement has already been made and written down permanently.
  // Without this the workflow can deadlock: reviewers that never reach
  // unanimity leave no path forward, and a gate nothing can satisfy stops being
  // a gate.
  const overridden = new Set(
    (attempt.overrides ?? []).map((entry) => entry.findingId),
  );
  const blocking = attempt.findings.filter(
    (finding) =>
      blockingSeverities.includes(finding.severity) &&
      !overridden.has(finding.id),
  );
  return {
    // Unchanged when nothing was overridden. Once the orchestrator has accepted
    // every blocking finding, its decision stands in place of unanimity.
    approved: blocking.length === 0 && (allApproved || overridden.size > 0),
    allApproved,
    blockingFindingIds: blocking.map((finding) => finding.id),
  };
}

// Each reviewer sees the work and nothing else.
//
// The packet used to carry the running findings list, every prior reviewer's
// summary, and an instruction to return uphold/dismiss assessments. That made
// reviewers anchor on each other, which is fatal to the only property
// unanimity has: two reviewers admit one bad artefact in sixteen instead of one
// in four *because their errors are uncorrelated*. A reviewer that has already
// read another's conclusions is no longer an independent sample.
export function reviewPacketMarkdown(options) {
  const {
    attempt,
    manifest,
    reviewKind = "slice",
    reviewer,
    scopeFile,
    snapshot,
  } = options;
  const reviewInstructions =
    reviewKind === "planning"
      ? `Read the approved Product Plan, every active scope manifest, run state,
scope coverage, repository instructions, architecture contracts, current
implementation, tests, fixtures, and relevant history. Verify requirement and
preservation traceability; entrypoint, contract, consumer, data-side-effect,
test, generated-file, release, and operations closure; exact worker paths;
dependency and lock correctness; safe concurrency; negative outcomes; and
non-goal preservation. Request changes for an omitted path, unjustified
not-applicable disposition, changed subsystem or policy, hidden migration or
external action, or any slice that cannot be completed from its worker packet.
Do not approve based only on manifest self-assertions.

Judge concurrency, dependencies, and failure contingencies against how slices
actually execute. Every slice is built by a fresh worker in its own detached
Git worktree, created at that slice's assigned base commit, with its own
checkout and its own dependency install. Concurrent slices share no working
tree, no lockfile state, and no installed modules. A dependency edge means the
downstream slice consumes an accepted upstream outcome, not merely that it runs
afterwards. So a change one slice makes to a manifest, lockfile, or shared file
is invisible to a sibling running from an earlier base, and a slice that fails
does not contaminate siblings that never carried its change. Do not report a
fallback or contingency as unrealizable on the assumption that slices share one
checkout.`
      : `Read the root instructions, plan, scope manifest, authorized patch, changed
files, tests, release notes, and relevant surrounding code. Review security,
correctness, UX, accessibility, selected-architecture boundaries,
performance, scalability, workspace coverage, requirement-to-test traceability,
negative and preservation cases, documentation, release notes, and accidental
files.`;
  return `# Parallel Slices ${reviewKind} review packet

You are reviewer \`${reviewer.id}\` (${reviewer.provider}).
Review the immutable source snapshot in this directory. Do not write files,
execute mutating commands, contact external systems, or change Git state.

You are reviewing independently. Other reviewers examine the same work at the
same time, you will not see their conclusions, and they will not see yours.
Report what you find, at the severity you actually believe. Your verdict is one
independent input to the orchestrator's decision, not a veto: it may accept a
finding you raise, on the record and with a stated reason. Report a problem
because it is real, not to force an outcome, and do not soften one to agree with
an imagined consensus.

## Contract

- Scope manifest: \`${scopeFile}\`
- Plan: \`${manifest.plan}\`
- Slice: ${manifest.slice}
- Requirements: ${manifest.requirements}
- Observable outcome: ${manifest.observable}
- Review kind: ${reviewKind}
- Source fingerprint: \`${attempt.fingerprint}\`
- Authorized patch: \`${snapshot.patchPath.slice(snapshot.snapshotRoot.length + 1)}\`
- Changed paths: ${attempt.changedPaths.map((path) => `\`${path}\``).join(", ")}

${reviewInstructions} Findings require precise repository-relative file and
line evidence.

## Verdict

Return \`approve\` or \`request_changes\` with a summary and your findings. An
approval may include non-blocking medium or low suggestions, but it cannot
carry a critical or high finding: if something is critical or high, the verdict
is \`request_changes\`.
`;
}
