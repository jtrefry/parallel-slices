#!/usr/bin/env node

// Create, list, and remove detached git worktrees for parallel workers.
//
// Worktrees live in a sibling directory of the repository
// (<repo>-worktrees/), so they never dirty the repository's own status and
// never survive inside the tree a gate inspects.
//
//   node worktree.mjs create --at <ref> [--name <label>]
//   node worktree.mjs list
//   node worktree.mjs remove <path>

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function fail(message) {
  console.error(`worktree: ${message}`);
  process.exit(1);
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    fail(error.stderr?.toString().trim() || `git ${args.join(" ")} failed`);
  }
}

function repositoryRoot() {
  return git(["rev-parse", "--show-toplevel"], process.cwd());
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { positional: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--at" || argument === "--name") {
      const value = rest[index + 1];
      if (!value) fail(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith("--")) {
      fail(`unknown option: ${argument}`);
    } else {
      options.positional.push(argument);
    }
  }
  return { command, options };
}

const { command, options } = parse(process.argv.slice(2));
const root = repositoryRoot();

if (command === "create") {
  if (!options.at) fail("create requires --at <ref>");
  const commit = git(["rev-parse", "--verify", `${options.at}^{commit}`], root);
  const parent = join(dirname(root), `${basename(root)}-worktrees`);
  mkdirSync(parent, { recursive: true });
  const label =
    options.name ?? `${commit.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const path = join(parent, label);
  if (existsSync(path)) fail(`worktree already exists: ${path}`);
  git(["worktree", "add", "--detach", path, commit], root);
  console.log(path);
} else if (command === "list") {
  console.log(git(["worktree", "list", "--porcelain"], root));
} else if (command === "remove") {
  const [target] = options.positional;
  if (!target) fail("remove requires a worktree path");
  git(["worktree", "remove", "--force", resolve(target)], root);
  git(["worktree", "prune"], root);
  console.log(`removed ${resolve(target)}`);
} else {
  fail(
    "usage: worktree.mjs create --at <ref> [--name <label>] | list | remove <path>",
  );
}
