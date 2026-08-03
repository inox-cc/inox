import { spawnSync } from 'node:child_process'

export type HostCommandResult = {
  code: number
  stderr: string
  stdout: string
}

export function runHostCommand(command: string, args: string[], cwd: string): HostCommandResult {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  const error = result.error?.message ?? ''

  return {
    code: result.status ?? 1,
    stderr: (result.stderr ?? '') + (error.length > 0 ? `${error}\n` : ''),
    stdout: result.stdout ?? ''
  }
}
