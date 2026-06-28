export interface OsModule {
  readonly EOL: string;

  arch(): string;
  homedir(): string;
  hostname(): string;
  platform(): string;
  release(): string;
  tmpdir(): string;
  type(): string;
}

export const EOL: string;

export function arch(): string;
export function homedir(): string;
export function hostname(): string;
export function platform(): string;
export function release(): string;
export function tmpdir(): string;
export function type(): string;

declare const os: OsModule;
export default os;
