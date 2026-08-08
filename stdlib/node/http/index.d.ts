export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void
export type ResponseListener = (response: IncomingMessage) => void
export type ErrorListener = (error: Error) => void
export type MessageListener = () => void
export type MessageDataListener = (chunk: string) => void
export type ServerCallback = () => void

export interface ListenOptions {
  readonly port?: number
  readonly host?: string
  readonly backlog?: number
}

export interface IncomingHttpHeaders {
  readonly [name: string]: string | undefined
}

export interface RequestOptions {
  readonly headers?: Record<string, string>
  readonly host?: string
  readonly hostname?: string
  readonly method?: string
  readonly path?: string
  readonly port?: number
}

export interface HttpModule {
  readonly IncomingMessage: typeof IncomingMessage
  readonly Server: typeof Server
  readonly ServerResponse: typeof ServerResponse

  createServer(listener?: RequestListener): Server
  get(url: string, listener?: ResponseListener): ClientRequest
  get(url: string, options: RequestOptions, listener?: ResponseListener): ClientRequest
  get(options: RequestOptions, listener?: ResponseListener): ClientRequest
  request(url: string, listener?: ResponseListener): ClientRequest
  request(url: string, options: RequestOptions, listener?: ResponseListener): ClientRequest
  request(options: RequestOptions, listener?: ResponseListener): ClientRequest
}

export class IncomingMessage {
  readonly headers: IncomingHttpHeaders
  readonly httpVersion: string
  readonly method: string
  readonly socket: import('node:net').Socket
  readonly statusCode?: number
  readonly statusMessage?: string
  readonly url: string

  isPaused(): boolean
  on(eventName: 'data', listener: MessageDataListener): IncomingMessage
  on(eventName: 'end' | 'close', listener: MessageListener): IncomingMessage
  on(eventName: 'error', listener: ErrorListener): IncomingMessage
  pause(): IncomingMessage
  resume(): IncomingMessage
  setEncoding(encoding: 'utf8' | 'utf-8'): IncomingMessage
}

export class ClientRequest {
  readonly headersSent: boolean
  readonly writableEnded: boolean

  destroy(): ClientRequest
  end(body?: string | Uint8Array): ClientRequest
  getHeader(name: string): string | undefined
  getHeaderNames(): string[]
  hasHeader(name: string): boolean
  on(eventName: 'response', listener: ResponseListener): ClientRequest
  on(eventName: 'error', listener: ErrorListener): ClientRequest
  on(eventName: 'finish' | 'close' | 'drain', listener: MessageListener): ClientRequest
  removeHeader(name: string): void
  setHeader(name: string, value: string): ClientRequest
  write(body: string | Uint8Array): boolean
}

export class ServerResponse {
  readonly headersSent: boolean
  statusCode: number
  readonly writableEnded: boolean

  end(body?: string | Uint8Array): void
  getHeader(name: string): string | undefined
  getHeaderNames(): string[]
  hasHeader(name: string): boolean
  on(eventName: 'drain', listener: MessageListener): ServerResponse
  removeHeader(name: string): void
  setHeader(name: string, value: string): ServerResponse
  write(body: string | Uint8Array): boolean
  writeHead(statusCode: number, headers?: Record<string, string>): ServerResponse
}

export class Server {
  address(): import('node:net').AddressInfo
  close(callback?: ServerCallback): Server
  listen(port?: number, host?: string, callback?: ServerCallback): Server
  listen(options: ListenOptions, callback?: ServerCallback): Server
  on(eventName: 'request', listener: RequestListener): Server
}

export function createServer(listener?: RequestListener): Server
export function get(url: string, listener?: ResponseListener): ClientRequest
export function get(url: string, options: RequestOptions, listener?: ResponseListener): ClientRequest
export function get(options: RequestOptions, listener?: ResponseListener): ClientRequest
export function request(url: string, listener?: ResponseListener): ClientRequest
export function request(url: string, options: RequestOptions, listener?: ResponseListener): ClientRequest
export function request(options: RequestOptions, listener?: ResponseListener): ClientRequest

declare const http: HttpModule
export default http
