export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void;
export type ServerCallback = () => void;

export interface ListenOptions {
  readonly port?: number;
  readonly host?: string;
  readonly backlog?: number;
}

export interface IncomingHttpHeaders {
  readonly [name: string]: string | undefined;
}

export interface HttpModule {
  readonly IncomingMessage: typeof IncomingMessage;
  readonly Server: typeof Server;
  readonly ServerResponse: typeof ServerResponse;

  createServer(listener?: RequestListener): Server;
}

export class IncomingMessage {
  readonly headers: IncomingHttpHeaders;
  readonly httpVersion: string;
  readonly method: string;
  readonly socket: import('node:net').Socket;
  readonly url: string;
}

export class ServerResponse {
  readonly headersSent: boolean;
  statusCode: number;
  readonly writableEnded: boolean;

  end(body?: string | Uint8Array): void;
  getHeader(name: string): string | undefined;
  getHeaderNames(): string[];
  hasHeader(name: string): boolean;
  removeHeader(name: string): void;
  setHeader(name: string, value: string): ServerResponse;
  write(body: string | Uint8Array): boolean;
  writeHead(statusCode: number, headers?: Record<string, string>): ServerResponse;
}

export class Server {
  close(callback?: ServerCallback): Server;
  listen(port?: number, host?: string, callback?: ServerCallback): Server;
  listen(options: ListenOptions, callback?: ServerCallback): Server;
  on(eventName: 'request', listener: RequestListener): Server;
}

export function createServer(listener?: RequestListener): Server;

declare const http: HttpModule;
export default http;
