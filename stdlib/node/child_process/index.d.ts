export interface ChildProcessSyncOptions {
  readonly encoding: 'utf8'
  readonly cwd?: string
  readonly env?: Record<string, string>
  readonly stdio?: 'pipe' | 'ignore'
  readonly timeout?: number
}

export interface SpawnSyncReturns {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
}

export interface ChildProcessModule {
  execSync(command: string, options: ChildProcessSyncOptions): string
  execFileSync(file: string, args: string[], options: ChildProcessSyncOptions): string
  execFileSync(file: string, options: ChildProcessSyncOptions): string
  spawnSync(file: string, args: string[], options: ChildProcessSyncOptions): SpawnSyncReturns
}

export function execSync(command: string, options: ChildProcessSyncOptions): string
export function execFileSync(file: string, args: string[], options: ChildProcessSyncOptions): string
export function execFileSync(file: string, options: ChildProcessSyncOptions): string
export function spawnSync(file: string, args: string[], options: ChildProcessSyncOptions): SpawnSyncReturns

declare const childProcess: ChildProcessModule
export default childProcess
