# Testing standards

Parallel Slices treats tests as evidence of behavior, not as files that merely
make a command turn green. Every formal requirement must have observable
acceptance evidence. Every [slice](glossary.md#slice) must identify the unit,
component, integration, E2E, and manual scenarios that apply, including
existing behavior that must remain unchanged. A regression fix must include a
test that would have detected the defect.

## Expected testing outcome

- tests assert externally observable behavior or a meaningful contract, not
  placeholders, assertion-free cases, trivially true conditions, or filler
  snapshots;
- critical success, failure, authorization, validation, concurrency, loading,
  and recovery paths are covered where applicable;
- the test layer matches the risk: pure logic stays in unit tests, real service
  boundaries use integration tests, and user-critical workflows use browser
  E2E tests;
- tests remain deterministic, isolated, and capable of failing when the
  behavior they protect is broken;
- the slice gate, requirement-to-test traceability, and fresh independent review
  all agree before the slice is accepted.

Unit tests must remain independent of Docker, databases, networks, and cloud
services. Those dependencies belong to integration or E2E tests.

## What a green pipeline proves

A green pipeline proves that the configured commands passed for the declared
scope. It does not mathematically prove that the application is defect-free or
that every assertion is valuable. Semantic test quality is established through
formal acceptance scenarios, behavior-focused tests, preservation cases, and
independent review in addition to the automated gate.

## Coverage policy

Parallel Slices deliberately does not impose blanket 100% repository coverage.
Initialization must define a project-specific, risk-based coverage policy and
add a required coverage pipeline step when quantitative thresholds are part of
that policy. The preferred standard is 100% coverage of approved requirements
and defect regressions, complete branch coverage for critical security and
domain logic, strong coverage of changed executable code, and no unexplained
coverage regression. Raw percentages never replace integration, E2E, manual, or
mutation evidence when those provide the stronger proof.

## Related pages

- [Configurable compilation and quality pipelines](configurable-quality-pipelines.md)
  for how test commands become enforced gates.
- [Operating guide](operating-guide.md) for when each gate runs during a run.
- [Local development](local-development.md) for container-backed integration
  and E2E environments in the bundled architecture.
