import { spawn } from "node:child_process";

const defaultOutputLimit = 2 * 1024 * 1024;
const terminationGraceMs = 2000;
const streamFlushGraceMs = 500;

function signalProcess(child, signal) {
  if (!child.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error.code !== "ESRCH") child.kill(signal);
      return;
    }
  }
  child.kill(signal);
}

export async function runSupervised(options) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs;
  const outputLimitBytes = options.outputLimitBytes ?? defaultOutputLimit;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("supervised process timeoutMs must be a positive integer");
  }

  return await new Promise((resolve) => {
    let outcome = "exited";
    let outputBytes = 0;
    let settled = false;
    let timeout = null;
    let forcedKill;
    let streamFlush;
    const stdout = [];
    const stderr = [];
    let child;

    const destroyStreams = () => {
      child?.stdout?.destroy();
      child?.stderr?.destroy();
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forcedKill);
      clearTimeout(streamFlush);
      resolve({
        outcome,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: Date.now() - startedAt,
        ...result,
      });
    };

    const terminate = (nextOutcome) => {
      if (outcome !== "exited") return;
      outcome = nextOutcome;
      signalProcess(child, "SIGTERM");
      forcedKill = setTimeout(() => {
        signalProcess(child, "SIGKILL");
        destroyStreams();
      }, terminationGraceMs);
    };

    try {
      const inheritedEnvironment = options.replaceEnv ? {} : process.env;
      child = spawn(options.command, options.args ?? [], {
        cwd: options.cwd,
        detached: process.platform !== "win32",
        env: {
          ...inheritedEnvironment,
          CI: "1",
          NO_COLOR: "1",
          TERM: "dumb",
          ...options.env,
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      outcome = "start_error";
      finish({ error, exitCode: null, signal: null });
      return;
    }

    const capture = (destination) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= outputLimitBytes) destination.push(chunk);
      if (outputBytes > outputLimitBytes) terminate("output_limit");
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
    child.on("error", (error) => {
      outcome = "start_error";
      finish({ error, exitCode: null, signal: null });
    });
    child.on("close", (exitCode, signal) => {
      finish({ exitCode, signal, error: null });
    });
    child.on("exit", (exitCode, signal) => {
      streamFlush = setTimeout(() => {
        destroyStreams();
        finish({ exitCode, signal, error: null });
      }, streamFlushGraceMs);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
    timeout = setTimeout(() => terminate("timed_out"), timeoutMs);
  });
}
