import type { Buffer, Uint8Array } from 'node:buffer';

export type SocketType = 'udp4';
export type SocketEventName = 'message';
export type SocketMessage = string | Buffer | Uint8Array;
export type SocketMessageListener = (message: Buffer, remoteInfo: RemoteInfo) => void;
export type SocketCallback = () => void;
export type SocketSendCallback = (error: Error | null, bytes: number) => void;

export interface AddressInfo {
  readonly address: string;
  readonly family: string;
  readonly port: number;
}

export interface RemoteInfo extends AddressInfo {
  readonly size: number;
}

export interface SocketOptions {
  readonly type: SocketType;
  readonly reuseAddr?: boolean;
  readonly recvBufferSize?: number;
  readonly sendBufferSize?: number;
}

export interface BindOptions {
  readonly port?: number;
  readonly address?: string;
}

export interface DgramModule {
  createSocket(options: SocketType | SocketOptions, callback?: SocketMessageListener): Socket;
}

export class Socket {
  address(): AddressInfo;
  bind(port?: number, address?: string, callback?: SocketCallback): Socket;
  bind(options: BindOptions, callback?: SocketCallback): Socket;
  close(callback?: SocketCallback): Socket;
  connect(port: number, address?: string, callback?: SocketCallback): Socket;
  disconnect(): Socket;
  getRecvBufferSize(): number;
  getSendBufferSize(): number;
  on(eventName: SocketEventName, listener: SocketMessageListener): Socket;
  ref(): Socket;
  remoteAddress(): AddressInfo;
  send(message: SocketMessage, callback?: SocketSendCallback): void;
  send(message: SocketMessage, port: number, address: string, callback?: SocketSendCallback): void;
  setBroadcast(flag: boolean): Socket;
  setRecvBufferSize(size: number): Socket;
  setSendBufferSize(size: number): Socket;
  setTTL(ttl: number): Socket;
  unref(): Socket;
}

export function createSocket(options: SocketType | SocketOptions, callback?: SocketMessageListener): Socket;

declare const dgram: DgramModule;
export default dgram;
