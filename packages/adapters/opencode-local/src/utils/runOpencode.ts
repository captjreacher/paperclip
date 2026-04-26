import { execa } from 'execa';

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: 'opencode' | 'npx';
};

export type RunOptions = {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
  graceSec?: number;
  onSpawn?: (pid: number) => Promise<void> | void;
  onLog?: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void> | void;
};

export async function runOpencode(
  args: string[],
  opts?: RunOptions
): Promise<RunResult> {
  const timeout = opts?.timeoutMs ?? 30000;
  const env = opts?.env;
  const cwd = opts?.cwd;
  const stdin = opts?.stdin;

  const attempt = async (cmd: string, args: string[]): Promise<RunResult> => {
    const proc = execa(cmd, args, {
      cwd,
      env,
      timeout,
      input: stdin,
      windowsHide: true,
      all: true,
    });

    if (!proc) {
      throw new Error(`Failed to start process: ${cmd}`);
    }

    if (opts?.onSpawn && proc.pid) {
      await opts.onSpawn(proc.pid);
    }

    if (opts?.onLog) {
      proc.stdout?.on('data', (chunk) => opts.onLog?.('stdout', chunk.toString()));
      proc.stderr?.on('data', (chunk) => opts.onLog?.('stderr', chunk.toString()));
    }

    const res = await proc;

    return {
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.exitCode ?? 0,
      command: cmd === 'npx' ? 'npx' : 'opencode',
    };
  };

  // First attempt: global CLI
  try {
    return await attempt('opencode', args);
  } catch (err: any) {
    // Fallback: npx
    try {
      return await attempt('npx', ['opencode', ...args]);
    } catch (fallbackErr: any) {
      throw new Error(
        JSON.stringify({
          error: 'OPENCODE_EXECUTION_FAILED',
          message: 'Failed to execute opencode via global CLI and npx fallback',
          details: {
            primary: err?.message,
            fallback: fallbackErr?.message,
          },
          hint: [
            'Ensure opencode is installed globally: npm install -g opencode-ai',
            'Or ensure npx is available',
            'On Windows, ensure npm global bin is on PATH',
          ],
        })
      );
    }
  }
}
