export interface ProcessArgv {
  readonly length: number;
  [index: number]: string;
}

export interface ProcessEnv {
  [key: string]: string;
}

export interface ProcessVersions {
  readonly node: string;
}

export interface ProcessModule {
  readonly arch: string;
  readonly argv: ProcessArgv;
  readonly argv0: string;
  readonly env: ProcessEnv;
  readonly execPath: string;
  exitCode: number;
  readonly pid: number;
  readonly platform: string;
  readonly version: string;
  readonly versions: ProcessVersions;

  cwd(): string;
  exit(code?: number): void;
}

export const arch: string;
export const argv: ProcessArgv;
export const argv0: string;
export const env: ProcessEnv;
export const execPath: string;
export let exitCode: number;
export const pid: number;
export const platform: string;
export const version: string;
export const versions: ProcessVersions;

export function cwd(): string;
export function exit(code?: number): void;

declare const process: ProcessModule;
export default process;
