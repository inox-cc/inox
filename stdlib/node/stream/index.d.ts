import type { Buffer } from 'node:buffer'
import type { EventEmitter } from 'node:events'

export type StreamCallback = (error?: Error) => void
export type StreamChunk = string | Buffer | Uint8Array
export type StreamEventName = 'close' | 'data' | 'drain' | 'end' | 'error' | 'finish'
export type StreamListener = (...args: unknown[]) => void

export interface StreamPromises {
  finished(stream: Stream): Promise<void>
  pipeline(...streams: Stream[]): Promise<void>
}

export interface StreamModule {
  readonly Stream: typeof Stream
  readonly Readable: typeof Readable
  readonly Writable: typeof Writable
  readonly Duplex: typeof Duplex
  readonly Transform: typeof Transform
  readonly PassThrough: typeof PassThrough
  readonly promises: StreamPromises

  finished(stream: Stream, callback?: StreamCallback): Stream
  pipeline(...streams: Stream[]): Stream
}

export interface Stream extends EventEmitter {}

export class Stream {
  readonly destroyed: boolean

  destroy(): this
  on(eventName: 'data', listener: (chunk: Buffer) => void): this
  on(eventName: 'error', listener: (error: Error) => void): this
  on(eventName: 'close' | 'drain' | 'end' | 'finish', listener: () => void): this
  once(eventName: 'data', listener: (chunk: Buffer) => void): this
  once(eventName: 'error', listener: (error: Error) => void): this
  once(eventName: 'close' | 'drain' | 'end' | 'finish', listener: () => void): this
  pipe(destination: Writable): Writable
}

export class Readable extends Stream {
  readonly readable: boolean
  readonly readableEnded: boolean
  readonly readableLength: number

  static from(iterable: unknown): Readable

  isPaused(): boolean
  pause(): this
  read(size?: number): Buffer | null
  resume(): this
}

export class Writable extends Stream {
  readonly writable: boolean
  readonly writableEnded: boolean
  readonly writableLength: number

  end(callback?: StreamCallback): this
  end(chunk: StreamChunk, callback?: StreamCallback): this
  write(chunk: StreamChunk, callback?: StreamCallback): boolean
}

export class Duplex extends Readable {
  readonly writable: boolean
  readonly writableEnded: boolean
  readonly writableLength: number

  end(callback?: StreamCallback): this
  end(chunk: StreamChunk, callback?: StreamCallback): this
  write(chunk: StreamChunk, callback?: StreamCallback): boolean
}

export class Transform extends Duplex {}

export class PassThrough extends Transform {}

export const promises: StreamPromises

export function finished(stream: Stream, callback?: StreamCallback): Stream
export function pipeline(...streams: Stream[]): Stream

declare const stream: StreamModule
export default stream
