import { spawn } from 'node:child_process'
import { rootDir } from './repo-root.ts'

export type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export type RunCommandOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdout?: NodeJS.WritableStream
  stderr?: NodeJS.WritableStream
}

export function runCommand(
  command: string,
  args: string[],
  cwdOrOptions: string | RunCommandOptions = rootDir
): Promise<CommandResult> {
  const options = typeof cwdOrOptions === 'string' ? { cwd: cwdOrOptions } : cwdOrOptions

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? rootDir,
      env: options.env === null || typeof options.env === 'undefined' ? undefined : { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk
      options.stdout?.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      options.stderr?.write(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}

export function normalizeNewlines(value: string): string {
  return value.replaceAll('\r\n', '\n')
}
