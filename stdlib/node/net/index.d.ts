export type ConnectionListener = (socket: Socket) => void;
export type ErrorListener = (error: Error) => void;
export type ListenCallback = () => void;
export type SocketCallback = () => void;
export type SocketCloseListener = (hadError: boolean) => void;
export type SocketDataListener = (chunk: string) => void;

export interface AddressInfo {
  readonly address: string;
  readonly family: string;
  readonly port: number;
}

export interface ListenOptions {
  readonly port?: number;
  readonly host?: string;
  readonly backlog?: number;
}

export interface ConnectionOptions {
  readonly port: number;
  readonly host?: string;
}

export interface NetModule {
  readonly Server: typeof Server;
  readonly Socket: typeof Socket;

  connect(port: number, callback?: SocketCallback): Socket;
  connect(port: number, host: string, callback?: SocketCallback): Socket;
  connect(options: ConnectionOptions, callback?: SocketCallback): Socket;
  createConnection(port: number, callback?: SocketCallback): Socket;
  createConnection(port: number, host: string, callback?: SocketCallback): Socket;
  createConnection(options: ConnectionOptions, callback?: SocketCallback): Socket;
  createServer(listener?: ConnectionListener): Server;
}

export class Server {
  address(): AddressInfo;
  close(callback?: ListenCallback): Server;
  listen(callback?: ListenCallback): Server;
  listen(port: number, callback?: ListenCallback): Server;
  listen(port: number, backlog: number, callback?: ListenCallback): Server;
  listen(port: number, host: string, callback?: ListenCallback): Server;
  listen(port: number, host: string, backlog: number, callback?: ListenCallback): Server;
  listen(options: ListenOptions, callback?: ListenCallback): Server;
  on(eventName: 'connection', listener: ConnectionListener): Server;
  on(eventName: 'listening' | 'close', listener: ListenCallback): Server;
  on(eventName: 'error', listener: ErrorListener): Server;
}

export class Socket {
  readonly bytesRead: number;
  readonly bytesWritten: number;
  readonly localAddress: string;
  readonly localPort: number;
  readonly remoteAddress: string;
  readonly remotePort: number;

  address(): AddressInfo;
  destroy(): Socket;
  end(callback?: SocketCallback): Socket;
  end(text: string, callback?: SocketCallback): Socket;
  on(eventName: 'data', listener: SocketDataListener): Socket;
  on(eventName: 'close', listener: SocketCloseListener): Socket;
  on(eventName: 'error', listener: ErrorListener): Socket;
  on(eventName: 'connect' | 'ready' | 'end' | 'drain', listener: SocketCallback): Socket;
  ref(): Socket;
  setEncoding(encoding: string): Socket;
  setKeepAlive(enabled?: boolean, initialDelay?: number): Socket;
  setNoDelay(enabled?: boolean): Socket;
  unref(): Socket;
  write(text: string, callback?: SocketCallback): boolean;
}

export function connect(port: number, callback?: SocketCallback): Socket;
export function connect(port: number, host: string, callback?: SocketCallback): Socket;
export function connect(options: ConnectionOptions, callback?: SocketCallback): Socket;
export function createConnection(port: number, callback?: SocketCallback): Socket;
export function createConnection(port: number, host: string, callback?: SocketCallback): Socket;
export function createConnection(options: ConnectionOptions, callback?: SocketCallback): Socket;
export function createServer(listener?: ConnectionListener): Server;

declare const net: NetModule;
export default net;
