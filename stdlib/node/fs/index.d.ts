import type { Buffer, Uint8Array } from 'node:buffer';

export type FsPath = string;
export type FsEncoding = 'utf8';
export type FsData = string | Buffer | Uint8Array;

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
