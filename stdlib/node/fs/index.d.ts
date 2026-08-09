import type { Buffer, Uint8Array } from 'node:buffer';

export type FsPath = string;
export type FsEncoding = 'utf8';
export type FsData = string | Buffer | Uint8Array;
export type NoParamCallback = (error: Error | null) => void;
export type BufferCallback = (error: Error | null, data: Buffer) => void;
export type StringCallback = (error: Error | null, value: string) => void;
export type StringArrayCallback = (error: Error | null, values: string[]) => void;
export type DirentArrayCallback = (error: Error | null, values: Dirent[]) => void;
export type StatsCallback = (error: Error | null, stats: Stats) => void;
export type MakeDirectoryCallback = (error: Error | null, path?: string) => void;

export interface AccessConstants {
  readonly F_OK: number;
  readonly R_OK: number;
  readonly W_OK: number;
  readonly X_OK: number;
}

export interface Dirent {
  readonly name: string;

  isDirectory(): boolean;
  isFile(): boolean;
}

export interface Stats {
  readonly mode: number;
  readonly mtimeMs: number;
  readonly size: number;

  isDirectory(): boolean;
  isFile(): boolean;
}

export interface MakeDirectoryOptions {
  readonly recursive?: boolean;
}

export interface RecursiveMakeDirectoryOptions {
  readonly recursive: true;
}

export interface ReadDirOptions {
  readonly encoding?: FsEncoding;
}

export interface ReadDirWithFileTypesOptions {
  readonly withFileTypes: true;
}

export interface RmOptions {
  readonly force?: boolean;
  readonly recursive?: boolean;
}

export interface FsPromises {
  access(path: FsPath, mode?: number): Promise<void>;
  appendFile(path: FsPath, data: FsData, encoding?: FsEncoding): Promise<void>;
  copyFile(src: FsPath, dest: FsPath): Promise<void>;
  lstat(path: FsPath): Promise<Stats>;
  mkdir(path: FsPath, options?: MakeDirectoryOptions): Promise<void>;
  readFile(path: FsPath): Promise<Buffer>;
  readFile(path: FsPath, encoding: FsEncoding): Promise<string>;
  readdir(path: FsPath, options?: FsEncoding | ReadDirOptions): Promise<string[]>;
  readdir(path: FsPath, options: ReadDirWithFileTypesOptions): Promise<Dirent[]>;
  readlink(path: FsPath): Promise<string>;
  realpath(path: FsPath): Promise<string>;
  rename(oldPath: FsPath, newPath: FsPath): Promise<void>;
  rm(path: FsPath, options?: RmOptions): Promise<void>;
  stat(path: FsPath): Promise<Stats>;
  symlink(target: FsPath, path: FsPath): Promise<void>;
  unlink(path: FsPath): Promise<void>;
  writeFile(path: FsPath, data: FsData, encoding?: FsEncoding): Promise<void>;
}

export interface FsModule {
  readonly constants: AccessConstants;
  readonly promises: FsPromises;

  access(path: FsPath, callback: NoParamCallback): void;
  access(path: FsPath, mode: number, callback: NoParamCallback): void;
  appendFile(path: FsPath, data: FsData, callback: NoParamCallback): void;
  appendFile(path: FsPath, data: FsData, encoding: FsEncoding, callback: NoParamCallback): void;
  copyFile(src: FsPath, dest: FsPath, callback: NoParamCallback): void;
  lstat(path: FsPath, callback: StatsCallback): void;
  mkdir(path: FsPath, callback: NoParamCallback): void;
  mkdir(path: FsPath, options: RecursiveMakeDirectoryOptions, callback: MakeDirectoryCallback): void;
  mkdir(path: FsPath, options: MakeDirectoryOptions, callback: NoParamCallback): void;
  readFile(path: FsPath, callback: BufferCallback): void;
  readFile(path: FsPath, encoding: FsEncoding, callback: StringCallback): void;
  readdir(path: FsPath, callback: StringArrayCallback): void;
  readdir(path: FsPath, options: FsEncoding | ReadDirOptions, callback: StringArrayCallback): void;
  readdir(path: FsPath, options: ReadDirWithFileTypesOptions, callback: DirentArrayCallback): void;
  readlink(path: FsPath, callback: StringCallback): void;
  realpath(path: FsPath, callback: StringCallback): void;
  rename(oldPath: FsPath, newPath: FsPath, callback: NoParamCallback): void;
  rm(path: FsPath, callback: NoParamCallback): void;
  rm(path: FsPath, options: RmOptions, callback: NoParamCallback): void;
  stat(path: FsPath, callback: StatsCallback): void;
  symlink(target: FsPath, path: FsPath, callback: NoParamCallback): void;
  unlink(path: FsPath, callback: NoParamCallback): void;
  writeFile(path: FsPath, data: FsData, callback: NoParamCallback): void;
  writeFile(path: FsPath, data: FsData, encoding: FsEncoding, callback: NoParamCallback): void;

  accessSync(path: FsPath, mode?: number): void;
  appendFileSync(path: FsPath, data: FsData, encoding?: FsEncoding): void;
  copyFileSync(src: FsPath, dest: FsPath): void;
  existsSync(path: FsPath): boolean;
  lstatSync(path: FsPath): Stats;
  mkdirSync(path: FsPath, options?: MakeDirectoryOptions): void;
  readFileSync(path: FsPath): Buffer;
  readFileSync(path: FsPath, encoding: FsEncoding): string;
  readdirSync(path: FsPath, options?: FsEncoding | ReadDirOptions): string[];
  readdirSync(path: FsPath, options: ReadDirWithFileTypesOptions): Dirent[];
  readlinkSync(path: FsPath): string;
  realpathSync(path: FsPath): string;
  renameSync(oldPath: FsPath, newPath: FsPath): void;
  rmSync(path: FsPath, options?: RmOptions): void;
  statSync(path: FsPath): Stats;
  symlinkSync(target: FsPath, path: FsPath): void;
  unlinkSync(path: FsPath): void;
  writeFileSync(path: FsPath, data: FsData, encoding?: FsEncoding): void;
}

export const constants: AccessConstants;
export const promises: FsPromises;

export function access(path: FsPath, callback: NoParamCallback): void;
export function access(path: FsPath, mode: number, callback: NoParamCallback): void;
export function appendFile(path: FsPath, data: FsData, callback: NoParamCallback): void;
export function appendFile(path: FsPath, data: FsData, encoding: FsEncoding, callback: NoParamCallback): void;
export function copyFile(src: FsPath, dest: FsPath, callback: NoParamCallback): void;
export function lstat(path: FsPath, callback: StatsCallback): void;
export function mkdir(path: FsPath, callback: NoParamCallback): void;
export function mkdir(path: FsPath, options: RecursiveMakeDirectoryOptions, callback: MakeDirectoryCallback): void;
export function mkdir(path: FsPath, options: MakeDirectoryOptions, callback: NoParamCallback): void;
export function readFile(path: FsPath, callback: BufferCallback): void;
export function readFile(path: FsPath, encoding: FsEncoding, callback: StringCallback): void;
export function readdir(path: FsPath, callback: StringArrayCallback): void;
export function readdir(path: FsPath, options: FsEncoding | ReadDirOptions, callback: StringArrayCallback): void;
export function readdir(path: FsPath, options: ReadDirWithFileTypesOptions, callback: DirentArrayCallback): void;
export function readlink(path: FsPath, callback: StringCallback): void;
export function realpath(path: FsPath, callback: StringCallback): void;
export function rename(oldPath: FsPath, newPath: FsPath, callback: NoParamCallback): void;
export function rm(path: FsPath, callback: NoParamCallback): void;
export function rm(path: FsPath, options: RmOptions, callback: NoParamCallback): void;
export function stat(path: FsPath, callback: StatsCallback): void;
export function symlink(target: FsPath, path: FsPath, callback: NoParamCallback): void;
export function unlink(path: FsPath, callback: NoParamCallback): void;
export function writeFile(path: FsPath, data: FsData, callback: NoParamCallback): void;
export function writeFile(path: FsPath, data: FsData, encoding: FsEncoding, callback: NoParamCallback): void;

export function accessSync(path: FsPath, mode?: number): void;
export function appendFileSync(path: FsPath, data: FsData, encoding?: FsEncoding): void;
export function copyFileSync(src: FsPath, dest: FsPath): void;
export function existsSync(path: FsPath): boolean;
export function lstatSync(path: FsPath): Stats;
export function mkdirSync(path: FsPath, options?: MakeDirectoryOptions): void;
export function readFileSync(path: FsPath): Buffer;
export function readFileSync(path: FsPath, encoding: FsEncoding): string;
export function readdirSync(path: FsPath, options?: FsEncoding | ReadDirOptions): string[];
export function readdirSync(path: FsPath, options: ReadDirWithFileTypesOptions): Dirent[];
export function readlinkSync(path: FsPath): string;
export function realpathSync(path: FsPath): string;
export function renameSync(oldPath: FsPath, newPath: FsPath): void;
export function rmSync(path: FsPath, options?: RmOptions): void;
export function statSync(path: FsPath): Stats;
export function symlinkSync(target: FsPath, path: FsPath): void;
export function unlinkSync(path: FsPath): void;
export function writeFileSync(path: FsPath, data: FsData, encoding?: FsEncoding): void;

declare const fs: FsModule;
export default fs;
