# Ground truth: <subject>

The exact values this work must reproduce, copied from the source named beside
each one. **Copy from this file. Do not retype, reflow, or correct anything in
it.** Tests assert these values byte for byte so an accidental cleanup fails
the build.

This file exists because builders may not be able to reach the original
source; this document is the authoritative record inside the repository.

## <Value set name>

Source: `<file>` lines `<n>` to `<m>` in `<repository>`.

| Value (exact) | Meaning / maps to |
| ------------- | ----------------- |
| `<value>`     | <meaning>         |

## Oddities that must survive

The entries an editor or a model will "helpfully" fix. Do not.

- **`<oddity>`**: <why it is deliberate, where it appears>

## Confidence

Which parts of this document are read from source and which are inferred.
State it per section. A section nobody has verified against the producing
code must say so, and name the check that would settle it.

## Extending this file

Add new parity data in the same shape: the exact value, its source file and
line, and any oddity that must survive. Never reconstruct a user-visible
value from a summary.
