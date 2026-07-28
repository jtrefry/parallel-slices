# Vulnerability suppression policy

Template. Commit it beside the suppression lists it governs and link it from
each list's header comment. Replace the file names with the ones this
repository uses.

One suppression list exists per scanning tool. Each list has a defined
scope, and the lists are deliberately not identical.

| List                             | Tool                      | Scope                                    |
| -------------------------------- | ------------------------- | ---------------------------------------- |
| `<package-manager audit config>` | `pnpm audit` (or similar) | Whole lockfile, devDependencies included |
| `<dependency review allow list>` | Pull request dep review   | Whole lockfile, devDependencies included |
| `<image scanner ignore file>`    | Image scanner             | What ships in the built images           |

## Rules

- The two lockfile-scoped lists are identical. They read the same lockfile,
  so a divergence is always a mistake. When several repositories share this
  policy, the review action references one shared external config file
  instead of keeping per-repository copies.
- The image list is empty by default. An image finding is fixed by upgrading
  the package or by removing it from the image, not by suppression.
- Every image-list entry that does exist carries the advisory id, a written
  justification, and a native expiry date. An entry with no expiry is a
  finding the team has decided to stop seeing, which is not a decision this
  policy allows.
- A dev-only acceptance never moves into the image list. If a dev-only
  package appears in an image, the packaging is the defect: stop shipping
  the package.
- Every entry in any list names its removal condition (the dependency bump,
  the upstream fix, the image change) so the next reader knows when it dies.
