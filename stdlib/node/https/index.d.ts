export type ResponseListener = (response: import('node:http').IncomingMessage) => void

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
  get(url: string, listener?: ResponseListener): import('node:http').ClientRequest
  get(url: string, options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
  get(options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
  request(url: string, listener?: ResponseListener): import('node:http').ClientRequest
  request(url: string, options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
  request(options: RequestOptions, listener?: ResponseListener): import('node:http').ClientRequest
}

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
