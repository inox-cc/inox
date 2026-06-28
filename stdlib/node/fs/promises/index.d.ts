import type { Buffer } from 'node:buffer';
import type { Dirent, FsData, FsEncoding, FsPath, FsPromises, MakeDirectoryOptions, ReadDirOptions, ReadDirWithFileTypesOptions, RmOptions, Stats } from '../index';

export function access(path: FsPath, mode?: number): Promise<void>;
export function appendFile(path: FsPath, data: FsData, encoding?: FsEncoding): Promise<void>;
export function copyFile(src: FsPath, dest: FsPath): Promise<void>;
export function lstat(path: FsPath): Promise<Stats>;
export function mkdir(path: FsPath, options?: MakeDirectoryOptions): Promise<void>;
export function readFile(path: FsPath): Promise<Buffer>;
export function readFile(path: FsPath, encoding: FsEncoding): Promise<string>;
export function readdir(path: FsPath, options?: FsEncoding | ReadDirOptions): Promise<string[]>;
export function readdir(path: FsPath, options: ReadDirWithFileTypesOptions): Promise<Dirent[]>;
export function readlink(path: FsPath): Promise<string>;
export function realpath(path: FsPath): Promise<string>;
export function rename(oldPath: FsPath, newPath: FsPath): Promise<void>;
export function rm(path: FsPath, options?: RmOptions): Promise<void>;
export function stat(path: FsPath): Promise<Stats>;
export function symlink(target: FsPath, path: FsPath): Promise<void>;
export function unlink(path: FsPath): Promise<void>;
export function writeFile(path: FsPath, data: FsData, encoding?: FsEncoding): Promise<void>;

declare const promises: FsPromises;
export default promises;
