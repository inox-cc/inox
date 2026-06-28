export type ConnectionListener = (socket: Socket) => void;
export type ListenCallback = () => void;
export type SocketCallback = () => void;
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

  connect(port: number, host?: string, callback?: SocketCallback): Socket;
  connect(options: ConnectionOptions, callback?: SocketCallback): Socket;
  createConnection(port: number, host?: string, callback?: SocketCallback): Socket;
  createConnection(options: ConnectionOptions, callback?: SocketCallback): Socket;
  createServer(listener?: ConnectionListener): Server;
}

export class Server {
  address(): AddressInfo;
  close(callback?: ListenCallback): Server;
  listen(port?: number, host?: string, backlog?: number, callback?: ListenCallback): Server;
  listen(options: ListenOptions, callback?: ListenCallback): Server;
  on(eventName: string, listener: ConnectionListener): Server;
}

export class Socket {
  readonly bytesRead: number;
  readonly bytesWritten: number;
  readonly localAddress: string;
  readonly localPort: number;
  readonly remoteAddress: string;
  readonly remotePort: number;

  address(): AddressInfo;
  close(): Socket;
  destroy(): Socket;
  end(text?: string, callback?: SocketCallback): Socket;
  on(eventName: string, listener: SocketDataListener): Socket;
  ref(): Socket;
  setEncoding(encoding: string): Socket;
  setKeepAlive(enabled?: boolean, initialDelay?: number): Socket;
  setNoDelay(enabled?: boolean): Socket;
  unref(): Socket;
  write(text: string, callback?: SocketCallback): boolean;
}

export function connect(port: number, host?: string, callback?: SocketCallback): Socket;
export function connect(options: ConnectionOptions, callback?: SocketCallback): Socket;
export function createConnection(port: number, host?: string, callback?: SocketCallback): Socket;
export function createConnection(options: ConnectionOptions, callback?: SocketCallback): Socket;
export function createServer(listener?: ConnectionListener): Server;

declare const net: NetModule;
export default net;
