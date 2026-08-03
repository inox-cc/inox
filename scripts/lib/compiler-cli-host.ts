import { spawnSync } from 'node:child_process'

export type HostCommandResult = {
  code: number
  stderr: string
  stdout: string
}

export function runHostCommand(command: string, args: string[], cwd: string): HostCommandResult {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })

  return {
    code: result.status ?? 1,
    stderr: result.error?.message ?? '',
    stdout: ''
  }
}

export function runHostProgram(command: string, args: string[], cwd: string): HostCommandResult {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })

  return {
    code: result.status ?? 1,
    stderr: result.error?.message ?? '',
    stdout: ''
  }
}
