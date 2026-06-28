export interface BufferConstants {
  readonly MAX_LENGTH: number;
}

export interface BufferConstructor {
  alloc(size: number): Buffer;
  from(value: string, encoding?: string): Buffer;
  isBuffer(value: unknown): boolean;
}

export interface BufferModule {
  readonly Buffer: BufferConstructor;
  readonly constants: BufferConstants;
}

export class Uint8Array {
  readonly length: number;

  constructor(length: number);
  constructor(values: number[]);

  slice(start: number, end?: number): Uint8Array;
}

export class Buffer extends Uint8Array {
  static alloc(size: number): Buffer;
  static from(value: string, encoding?: string): Buffer;
  static isBuffer(value: unknown): boolean;

  toString(encoding?: string): string;
}

export const constants: BufferConstants;

declare const buffer: BufferModule;
export default buffer;
