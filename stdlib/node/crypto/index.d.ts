import type { Buffer, Uint8Array } from 'node:buffer'

export type BinaryLike = string | Buffer | Uint8Array
export type BinaryBuffer = Buffer | Uint8Array

export interface CryptoModule {
  createHash(algorithm: string): Hash
  createHmac(algorithm: string, key: BinaryLike): Hmac
  getHashes(): string[]
  getRandomValues(bytes: BinaryBuffer): BinaryBuffer
  hash(algorithm: string, data: BinaryLike, outputEncoding?: string): string | Buffer
  randomBytes(size: number): Buffer
  randomFillSync(buffer: BinaryBuffer, offset?: number, size?: number): BinaryBuffer
  randomInt(max: number): number
  randomInt(min: number, max: number): number
  randomUUID(): string
  timingSafeEqual(a: BinaryBuffer, b: BinaryBuffer): boolean
}

export class Hash {
  update(data: BinaryLike, inputEncoding?: string): Hash
  digest(): Buffer
  digest(encoding: string): string | Buffer
}

export class Hmac {
  update(data: BinaryLike, inputEncoding?: string): Hmac
  digest(): Buffer
  digest(encoding: string): string | Buffer
}

export function createHash(algorithm: string): Hash
export function createHmac(algorithm: string, key: BinaryLike): Hmac
export function getHashes(): string[]
export function getRandomValues(bytes: BinaryBuffer): BinaryBuffer
export function hash(algorithm: string, data: BinaryLike, outputEncoding?: string): string | Buffer
export function randomBytes(size: number): Buffer
export function randomFillSync(buffer: BinaryBuffer, offset?: number, size?: number): BinaryBuffer
export function randomInt(max: number): number
export function randomInt(min: number, max: number): number
export function randomUUID(): string
export function timingSafeEqual(a: BinaryBuffer, b: BinaryBuffer): boolean

declare const crypto: CryptoModule
export default crypto
