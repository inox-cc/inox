import type { Buffer, Uint8Array } from 'node:buffer'

export type BinaryLike = string | Buffer | Uint8Array
export type BinaryBuffer = Buffer | Uint8Array

export interface ScryptOptions {
  cost?: number
  N?: number
  blockSize?: number
  r?: number
  parallelization?: number
  p?: number
  maxmem?: number
}

export interface CipherGCMOptions {
  authTagLength?: number
}

export interface AADOptions {
  encoding?: string
  plaintextLength?: number
}

export interface CryptoModule {
  createHash(algorithm: string): Hash
  createHmac(algorithm: string, key: BinaryLike): Hmac
  createCipheriv(algorithm: string, key: BinaryLike, iv: BinaryLike, options?: CipherGCMOptions): Cipheriv
  createDecipheriv(algorithm: string, key: BinaryLike, iv: BinaryLike, options?: CipherGCMOptions): Decipheriv
  getHashes(): string[]
  getRandomValues(bytes: BinaryBuffer): BinaryBuffer
  hkdfSync(digest: string, ikm: BinaryLike, salt: BinaryLike, info: BinaryLike, keylen: number): Buffer
  hash(algorithm: string, data: BinaryLike, outputEncoding: 'buffer'): Buffer
  hash(algorithm: string, data: BinaryLike, outputEncoding?: string): string
  pbkdf2Sync(password: BinaryLike, salt: BinaryLike, iterations: number, keylen: number, digest: string): Buffer
  randomBytes(size: number): Buffer
  randomFillSync(buffer: BinaryBuffer, offset?: number, size?: number): BinaryBuffer
  randomInt(max: number): number
  randomInt(min: number, max: number): number
  randomUUID(): string
  scryptSync(password: BinaryLike, salt: BinaryLike, keylen: number, options?: ScryptOptions): Buffer
  timingSafeEqual(a: BinaryBuffer, b: BinaryBuffer): boolean
}

export class Hash {
  update(data: BinaryLike, inputEncoding?: string): Hash
  digest(): Buffer
  digest(encoding: string): string
}

export class Hmac {
  update(data: BinaryLike, inputEncoding?: string): Hmac
  digest(): Buffer
  digest(encoding: string): string
}

export class Cipheriv {
  update(data: BinaryLike): Buffer
  update(data: BinaryLike, inputEncoding: string): Buffer
  update(data: BinaryLike, inputEncoding: string, outputEncoding: 'hex'): string
  final(): Buffer
  final(outputEncoding: 'hex'): string
  getAuthTag(): Buffer
  setAAD(buffer: BinaryLike, options?: AADOptions): Cipheriv
}

export class Decipheriv {
  update(data: BinaryLike): Buffer
  update(data: BinaryLike, inputEncoding: string): Buffer
  update(data: BinaryLike, inputEncoding: string, outputEncoding: 'hex' | 'utf8' | 'utf-8'): string
  final(): Buffer
  final(outputEncoding: 'hex' | 'utf8' | 'utf-8'): string
  setAAD(buffer: BinaryLike, options?: AADOptions): Decipheriv
  setAuthTag(buffer: BinaryLike, encoding?: string): Decipheriv
}

export function createCipheriv(algorithm: string, key: BinaryLike, iv: BinaryLike, options?: CipherGCMOptions): Cipheriv
export function createDecipheriv(
  algorithm: string,
  key: BinaryLike,
  iv: BinaryLike,
  options?: CipherGCMOptions
): Decipheriv
export function createHash(algorithm: string): Hash
export function createHmac(algorithm: string, key: BinaryLike): Hmac
export function getHashes(): string[]
export function getRandomValues(bytes: BinaryBuffer): BinaryBuffer
export function hkdfSync(digest: string, ikm: BinaryLike, salt: BinaryLike, info: BinaryLike, keylen: number): Buffer
export function hash(algorithm: string, data: BinaryLike, outputEncoding: 'buffer'): Buffer
export function hash(algorithm: string, data: BinaryLike, outputEncoding?: string): string
export function pbkdf2Sync(
  password: BinaryLike,
  salt: BinaryLike,
  iterations: number,
  keylen: number,
  digest: string
): Buffer
export function randomBytes(size: number): Buffer
export function randomFillSync(buffer: BinaryBuffer, offset?: number, size?: number): BinaryBuffer
export function randomInt(max: number): number
export function randomInt(min: number, max: number): number
export function randomUUID(): string
export function scryptSync(password: BinaryLike, salt: BinaryLike, keylen: number, options?: ScryptOptions): Buffer
export function timingSafeEqual(a: BinaryBuffer, b: BinaryBuffer): boolean

declare const crypto: CryptoModule
export default crypto
