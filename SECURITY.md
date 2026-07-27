# Security policy

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, pull
request, test fixture, or log.

Use GitHub's private vulnerability reporting feature for this repository. Add:

- the affected file and version or commit;
- the prerequisite state and reproduction steps;
- the security impact;
- any safe mitigation you have identified; and
- whether the report contains secrets or personal data.

If private vulnerability reporting is unavailable, open a public issue asking
the maintainers to enable a private reporting channel. Do not include security
details in that issue.

Maintainers should acknowledge a complete report promptly, keep the reporter
informed during triage, and coordinate disclosure only after a fix or mitigation
is available.

## Supported versions

Until the project publishes versioned releases, only the latest commit on the
default branch is eligible for security fixes. Published release support must
be documented before the first stable release.

## Security boundaries

Parallel Slices writes files and runs configured development commands in a target
repository. It does not authorize production deployments, production database
migrations, secret access, publication, or changes to external systems. Review
the installer and generated workflows before use in a sensitive environment.
