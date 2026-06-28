export type UrlInput = string | URL;
export type URLSearchParamsInit = string | Record<string, string>;

export interface URLModule {
  readonly URL: typeof URL;
  readonly URLSearchParams: typeof URLSearchParams;

  fileURLToPath(url: UrlInput): string;
  pathToFileURL(path: string): URL;
}

export class URL {
  href: string;
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;

  constructor(input: string, base?: UrlInput);
}

export class URLSearchParams {
  constructor(init?: URLSearchParamsInit);

  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  toString(): string;
}

export function fileURLToPath(url: UrlInput): string;
export function pathToFileURL(path: string): URL;

declare const url: URLModule;
export default url;
