export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void;
export type ServerCallback = () => void;

export interface ListenOptions {
  readonly port?: number;
  readonly host?: string;
  readonly backlog?: number;
}

export interface HttpModule {
  readonly IncomingMessage: typeof IncomingMessage;
  readonly Server: typeof Server;
  readonly ServerResponse: typeof ServerResponse;

  createServer(listener?: RequestListener): Server;
}

export class IncomingMessage {
  readonly method: string;
  readonly url: string;
}

export class ServerResponse {
  statusCode: number;

  end(body?: string): void;
  setHeader(name: string, value: string): void;
  write(body: string): boolean;
  writeHead(statusCode: number, headers?: Record<string, string>): ServerResponse;
}

export class Server {
  close(callback?: ServerCallback): Server;
  listen(port?: number, host?: string, callback?: ServerCallback): Server;
  listen(options: ListenOptions, callback?: ServerCallback): Server;
  on(eventName: string, listener: RequestListener): Server;
}

export function createServer(listener?: RequestListener): Server;

declare const http: HttpModule;
export default http;
