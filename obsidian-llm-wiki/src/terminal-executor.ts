import { spawn } from "child_process";

export interface TerminalRunResult {
  output: string;
  exitCode: number | null;
}

export async function runCommand(command: string, cwd: string): Promise<TerminalRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      resolve({ output: output.trimEnd(), exitCode: code });
    });
  });
}
