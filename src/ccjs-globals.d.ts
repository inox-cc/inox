declare const crypto: {
  getRandomValues<T extends Buffer | Uint8Array>(bytes: T): T
}

type FetchResponse = {
  readonly status: number
  readonly ok: boolean
  readonly url: string
  readonly statusText: string
  readonly redirected: boolean
  readonly headers: FetchHeaders
  text(): Promise<string>
}

type FetchHeaders = {
  get(name: string): string | null
  has(name: string): boolean
}

type FetchInit = {
  readonly method?: string
  readonly headers?: {
    readonly [name: string]: string
  }
  readonly body?: string | Buffer | Uint8Array
  readonly signal?: AbortSignal
  readonly redirect?: 'follow' | 'manual' | 'error'
}

declare function fetch(url: string, init?: FetchInit): Promise<FetchResponse>

type AbortSignal = {
  readonly aborted: boolean
}

declare class AbortController {
  readonly signal: AbortSignal
  abort(): void
}
