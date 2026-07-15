export interface OsModule {
  readonly EOL: string

  arch(): string
  availableParallelism(): number
  cpus(): unknown[]
  freemem(): number
  getPriority(pid?: number): number
  homedir(): string
  hostname(): string
  loadavg(): number[]
  machine(): string
  networkInterfaces(): Record<string, unknown[]>
  platform(): string
  release(): string
  setPriority(priority: number): void
  setPriority(pid: number, priority: number): void
  totalmem(): number
  tmpdir(): string
  type(): string
  uptime(): number
  userInfo(): unknown
  version(): string
}

export const EOL: string

export function arch(): string
export function availableParallelism(): number
export function cpus(): unknown[]
export function freemem(): number
export function getPriority(pid?: number): number
export function homedir(): string
export function hostname(): string
export function loadavg(): number[]
export function machine(): string
export function networkInterfaces(): Record<string, unknown[]>
export function platform(): string
export function release(): string
export function setPriority(priority: number): void
export function setPriority(pid: number, priority: number): void
export function totalmem(): number
export function tmpdir(): string
export function type(): string
export function uptime(): number
export function userInfo(): unknown
export function version(): string

declare const os: OsModule
export default os
