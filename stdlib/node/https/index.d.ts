export type ResponseListener = (response: import('node:http').IncomingMessage) => void
export type RequestListener = (
  request: import('node:http').IncomingMessage,
  response: import('node:http').ServerResponse
) => void
export type Server = import('node:http').Server

export interface ServerOptions {
  readonly cert: string | Uint8Array
  readonly key: string | Uint8Array
}

export interface RequestOptions {
  readonly headers?: Record<string, string>
  readonly host?: string
  readonly hostname?: string
  readonly method?: string
  readonly path?: string
  readonly port?: number
  readonly rejectUnauthorized?: boolean
  readonly servername?: string
}

export interface HttpsModule {
  createServer(options: ServerOptions, listener?: RequestListener): Server
  get(url: string, listener?: ResponseListener): import('node:http').ClientRequest
  get(url: string, options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
  get(options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
  request(url: string, listener?: ResponseListener): import('node:http').ClientRequest
  request(url: string, options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
  request(options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
}

export function createServer(options: ServerOptions, listener?: RequestListener): Server
export function get(url: string, listener?: ResponseListener): import('node:http').ClientRequest
export function get(
  url: string,
  options: RequestOptions,
  listener?: ResponseListener
): import('node:http').ClientRequest
export function get(options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
export function request(url: string, listener?: ResponseListener): import('node:http').ClientRequest
export function request(
  url: string,
  options: RequestOptions,
  listener?: ResponseListener
): import('node:http').ClientRequest
export function request(options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest

declare const https: HttpsModule
export default https
