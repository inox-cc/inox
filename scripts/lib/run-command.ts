import { spawn } from 'node:child_process'
import { rootDir } from './repo-checks.ts'

export type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export function runCommand(command: string, args: string[], cwd = rootDir): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('exit', code => {
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
