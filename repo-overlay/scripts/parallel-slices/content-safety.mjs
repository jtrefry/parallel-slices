import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { resolve, sep } from "node:path";

const secretPatterns = Object.freeze([
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk_live_[A-Za-z0-9]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  /\bglpat-[0-9A-Za-z_-]{20,}/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\baws.{0,20}["'][A-Za-z0-9/+]{40}["']/i,
]);
const machinePathPatterns = Object.freeze([
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/,
]);

const maximumFullScanBytes = 2_000_000;
const scanPrefixBytes = 64 * 1024;

export function containsPotentialSecret(text) {
  return secretPatterns.some((pattern) => pattern.test(text));
}

export function containsMachineSpecificPath(text) {
  return machinePathPatterns.some((pattern) => pattern.test(text));
}

export function containsUnsafeTextControl(text) {
  return [...text].some((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || code === 127;
  });
}

export function containsUnsafeProseControl(text) {
  return [...text].some((character) => {
    const code = character.codePointAt(0);
    if (code === 9 || code === 10 || code === 13) return false;
    if (code <= 31 || code === 127) return true;
    if (code >= 0x202a && code <= 0x202e) return true;
    if (code >= 0x2066 && code <= 0x2069) return true;
    if (code >= 0x200b && code <= 0x200d) return true;
    return code === 0x2060 || code === 0xfeff;
  });
}

function readScanPrefix(absolute) {
  const descriptor = openSync(absolute, "r");
  try {
    const buffer = Buffer.alloc(scanPrefixBytes);
    const bytes = readSync(descriptor, buffer, 0, scanPrefixBytes, 0);
    return buffer.subarray(0, bytes);
  } finally {
    closeSync(descriptor);
  }
}

function scannableText(content, oversized) {
  if (oversized || content.includes(0)) {
    return content.subarray(0, scanPrefixBytes).toString("latin1");
  }
  return content.toString("utf8");
}

export function assertNoPotentialSecrets(root, paths, label = "file") {
  const prefix = `${resolve(root)}${sep}`;
  for (const path of paths) {
    const absolute = resolve(root, path);
    if (!absolute.startsWith(prefix))
      throw new Error(`unsafe ${label} path: ${path}`);
    if (!existsSync(absolute)) continue;
    const oversized = statSync(absolute).size > maximumFullScanBytes;
    const content = oversized
      ? readScanPrefix(absolute)
      : readFileSync(absolute);
    if (containsPotentialSecret(scannableText(content, oversized))) {
      throw new Error(`possible secret detected in ${label}: ${path}`);
    }
  }
}

export function assertNoPotentialSecretsAtRevision(
  root,
  paths,
  revision = "HEAD",
  label = "committed file",
) {
  for (const path of paths) {
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((segment) => ["", ".", ".."].includes(segment))
    ) {
      throw new Error(`unsafe ${label} path: ${path}`);
    }
    const object = `${revision}:${path}`;
    let size;
    try {
      size = Number(
        execFileSync("git", ["cat-file", "-s", object], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim(),
      );
    } catch {
      console.warn(
        `warning: could not read ${label} for secret scanning: ${path}`,
      );
      continue;
    }
    if (!Number.isFinite(size)) continue;
    if (size > maximumFullScanBytes) {
      console.warn(
        `warning: secret scan covers only the first ${scanPrefixBytes} bytes of oversized ${label}: ${path}`,
      );
      continue;
    }
    const content = execFileSync("git", ["cat-file", "blob", object], {
      cwd: root,
      encoding: null,
      maxBuffer: 2_100_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (containsPotentialSecret(scannableText(content, false))) {
      throw new Error(`possible secret detected in ${label}: ${path}`);
    }
  }
}
