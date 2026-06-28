export interface ParsedPath {
  readonly root: string;
  readonly dir: string;
  readonly base: string;
  readonly ext: string;
  readonly name: string;
}

export interface FormatInputPathObject {
  readonly root?: string;
  readonly dir?: string;
  readonly base?: string;
  readonly ext?: string;
  readonly name?: string;
}

export interface PathModule {
  readonly delimiter: string;
  readonly sep: string;
  readonly posix: PathModule;

  basename(path: string, suffix?: string): string;
  dirname(path: string): string;
  extname(path: string): string;
  format(pathObject: FormatInputPathObject): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
  normalize(path: string): string;
  parse(path: string): ParsedPath;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
}

export const delimiter: string;
export const sep: string;
export const posix: PathModule;

export function basename(path: string, suffix?: string): string;
export function dirname(path: string): string;
export function extname(path: string): string;
export function format(pathObject: FormatInputPathObject): string;
export function isAbsolute(path: string): boolean;
export function join(...paths: string[]): string;
export function normalize(path: string): string;
export function parse(path: string): ParsedPath;
export function relative(from: string, to: string): string;
export function resolve(...paths: string[]): string;

declare const path: PathModule;
export default path;
