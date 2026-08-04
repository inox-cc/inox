export type UrlInput = string | URL;
export type URLSearchParamsInit = string | Record<string, string>;

export interface URLModule {
  readonly URL: typeof URL;
  readonly URLSearchParams: typeof URLSearchParams;

  fileURLToPath(url: UrlInput): string;
  pathToFileURL(path: string): URL;
  domainToASCII(domain: string): string;
  domainToUnicode(domain: string): string;
  format(url: URL, options?: object): string;
  parse(url: string): object;
  resolve(from: string, to: string): string;
  urlToHttpOptions(url: URL): object;
}

export class URL {
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  pathname: string;
  search: string;
  hash: string;

  constructor(input: string, base?: UrlInput);

  toJSON(): string;
  toString(): string;
}

export class URLSearchParams {
  readonly size: number;

  constructor(init?: URLSearchParamsInit);

  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  sort(): void;
  toString(): string;
}

export function fileURLToPath(url: UrlInput): string;
export function pathToFileURL(path: string): URL;
export function domainToASCII(domain: string): string;
export function domainToUnicode(domain: string): string;
export function format(url: URL, options?: object): string;
export function parse(url: string): object;
export function resolve(from: string, to: string): string;
export function urlToHttpOptions(url: URL): object;

declare const url: URLModule;
export default url;
