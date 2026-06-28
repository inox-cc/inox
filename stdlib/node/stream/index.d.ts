export type StreamCallback = (error?: Error) => void;
export type StreamEventName = string | symbol;
export type StreamListener = (...args: unknown[]) => void;

export interface StreamPromises {
  finished(stream: Stream): Promise<void>;
  pipeline(...streams: Stream[]): Promise<void>;
}

export interface StreamModule {
  readonly Stream: typeof Stream;
  readonly Readable: typeof Readable;
  readonly Writable: typeof Writable;
  readonly Duplex: typeof Duplex;
  readonly Transform: typeof Transform;
  readonly PassThrough: typeof PassThrough;
  readonly promises: StreamPromises;

  finished(stream: Stream, callback?: StreamCallback): Stream;
  pipeline(...streams: Stream[]): Stream;
}

export class Stream {
  on(eventName: StreamEventName, listener: StreamListener): Stream;
  once(eventName: StreamEventName, listener: StreamListener): Stream;
  pipe(destination: Stream): Stream;
}

export class Readable extends Stream {
  static from(iterable: unknown): Readable;

  read(size?: number): string | null;
}

export class Writable extends Stream {
  end(chunk?: unknown, callback?: StreamCallback): void;
  write(chunk: unknown, callback?: StreamCallback): boolean;
}

export class Duplex extends Readable {
  end(chunk?: unknown, callback?: StreamCallback): void;
  write(chunk: unknown, callback?: StreamCallback): boolean;
}

export class Transform extends Duplex {
}

export class PassThrough extends Transform {
}

export const promises: StreamPromises;

export function finished(stream: Stream, callback?: StreamCallback): Stream;
export function pipeline(...streams: Stream[]): Stream;

declare const stream: StreamModule;
export default stream;
