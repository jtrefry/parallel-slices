#!/usr/bin/env node

// Verify that a candidate changed only the paths its assignment owns.
//
//   node scope-check.mjs --base <ref> --allow <glob> [--allow <glob>]...
//
// Compares the working tree (including staged and untracked files) against
// the base ref. Exits 1 and lists every path outside the allowed set, so an
// orchestrator can refuse a candidate that wandered out of its boundary.
//
// Glob support: `**` crosses directories, `*` and `?` stay within one path
// segment. Patterns are anchored to the repository root.

import { execFileSync } from "node:child_process";

function fail(message) {
  console.error(`scope-check: ${message}`);
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    fail(error.stderr?.toString().trim() || `git ${args.join(" ")} failed`);
  }
}

function parse(argv) {
  const options = { allow: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base" || argument === "--allow") {
      const value = argv[index + 1];
      if (!value) fail(`${argument} requires a value`);
      if (argument === "--base") options.base = value;
      else options.allow.push(value);
      index += 1;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!options.base) fail("--base <ref> is required");
  if (!options.allow.length) fail("at least one --allow <glob> is required");
  return options;
}

export function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*") {
      if (glob[index + 1] === "*") {
        pattern += ".*";
        index += 1;
        if (glob[index + 1] === "/") index += 1;
      } else {
        pattern += "[^/]*";
      }
    } else if (character === "?") {
      pattern += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(character)) {
      pattern += `\\${character}`;
    } else {
      pattern += character;
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function changedPaths(base) {
  const tracked = git(["diff", "--name-only", base, "--"])
    .split("\n")
    .filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

const executedDirectly =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());

if (executedDirectly) {
  const options = parse(process.argv.slice(2));
  const patterns = options.allow.map(globToRegExp);
  const outside = changedPaths(options.base).filter(
    (path) => !patterns.some((pattern) => pattern.test(path)),
  );
  if (outside.length) {
    console.error("changed paths outside the assignment:");
    for (const path of outside) console.error(`  ${path}`);
    process.exit(1);
  }
  console.log("scope check passed");
}
