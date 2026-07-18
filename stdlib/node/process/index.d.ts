export interface ProcessArgv {
  readonly length: number
  [index: number]: string
}

export interface ProcessEnv {
  [key: string]: string
}

export interface ProcessHrtime {
  readonly length: number
  [index: number]: number
}

export interface ProcessMemoryUsage {
  readonly rss: number
  readonly heapTotal: number
  readonly heapUsed: number
  readonly external: number
  readonly arrayBuffers: number
}

export interface ProcessVersions {
  readonly node: string
}

export interface ProcessModule {
  readonly arch: string
  readonly argv: ProcessArgv
  readonly argv0: string
  readonly env: ProcessEnv
  readonly execPath: string
  exitCode: number
  readonly pid: number
  readonly platform: string
  readonly version: string
  readonly versions: ProcessVersions

  cwd(): string
  exit(code?: number): void
  hrtime(time?: ProcessHrtime): ProcessHrtime
  memoryUsage(): ProcessMemoryUsage
}

export const arch: string
export const argv: ProcessArgv
export const argv0: string
export const env: ProcessEnv
export const execPath: string
export let exitCode: number
export const pid: number
export const platform: string
export const version: string
export const versions: ProcessVersions

export function cwd(): string
export function exit(code?: number): void
export function hrtime(time?: ProcessHrtime): ProcessHrtime
export function memoryUsage(): ProcessMemoryUsage

declare const process: ProcessModule
export default process

declare global {
  interface ProcessArgv {
    readonly length: number
    [index: number]: string
  }

  interface ProcessEnv {
    [key: string]: string
  }

  interface ProcessHrtime {
    readonly length: number
    [index: number]: number
  }

  interface ProcessMemoryUsage {
    readonly rss: number
    readonly heapTotal: number
    readonly heapUsed: number
    readonly external: number
    readonly arrayBuffers: number
  }

  interface ProcessVersions {
    readonly node: string
  }

  interface Process {
    readonly arch: string
    readonly argv: ProcessArgv
    readonly argv0: string
    readonly env: ProcessEnv
    readonly execPath: string
    exitCode: number
    readonly pid: number
    readonly platform: string
    readonly version: string
    readonly versions: ProcessVersions

    cwd(): string
    exit(code?: number): void
    hrtime(time?: ProcessHrtime): ProcessHrtime
    memoryUsage(): ProcessMemoryUsage
  }

  const process: Process
}
