export interface BufferConstants {
  readonly MAX_LENGTH: number;
}

export interface BufferConstructor {
  alloc(size: number): Buffer;
  byteLength(value: string, encoding?: string): number;
  compare(first: Uint8Array, second: Uint8Array): number;
  concat(list: Uint8Array[], totalLength?: number): Buffer;
  from(value: string, encoding?: string): Buffer;
  from(value: Uint8Array): Buffer;
  isBuffer(value: unknown): boolean;
}

export interface BufferModule {
  readonly Buffer: BufferConstructor;
  readonly constants: BufferConstants;
}

export class Buffer extends Uint8Array {
  readonly length: number;

  static alloc(size: number): Buffer;
  static byteLength(value: string, encoding?: string): number;
  static compare(first: Uint8Array, second: Uint8Array): number;
  static concat(list: Uint8Array[], totalLength?: number): Buffer;
  static from(value: string, encoding?: string): Buffer;
  static from(value: Uint8Array): Buffer;
  static isBuffer(value: unknown): boolean;

  compare(target: Uint8Array): number;
  copy(target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  equals(otherBuffer: Uint8Array): boolean;
  slice(start: number, end?: number): Buffer;
  subarray(start?: number, end?: number): Buffer;
  toString(encoding?: string): string;
}

export const constants: BufferConstants;

declare const buffer: BufferModule;
export default buffer;
