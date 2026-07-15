export interface BufferConstants {
  readonly MAX_LENGTH: number
}

export interface BufferConstructor {
  alloc(size: number): Buffer
  from(value: string, encoding?: string): Buffer
  isBuffer(value: unknown): boolean
}

export interface BufferModule {
  readonly Buffer: BufferConstructor
  readonly constants: BufferConstants
}

export class Buffer extends Uint8Array {
  readonly length: number

  static alloc(size: number): Buffer
  static from(value: string, encoding?: string): Buffer
  static isBuffer(value: unknown): boolean

  slice(start: number, end?: number): Buffer
  toString(encoding?: string): string
}

export const constants: BufferConstants

declare const buffer: BufferModule
export default buffer
