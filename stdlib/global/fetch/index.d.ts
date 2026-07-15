export {}

declare global {
  interface Headers {
    get(name: string): string | null
    has(name: string): boolean
  }

  interface Response {
    readonly status: number
    readonly ok: boolean
    readonly url: string
    readonly statusText: string
    readonly redirected: boolean
    readonly headers: Headers
    readonly body: unknown

    arrayBuffer(): Promise<unknown>
    blob(): Promise<unknown>
    bytes(): Promise<unknown>
    formData(): Promise<unknown>
    json(): Promise<unknown>
    text(): Promise<string>
  }

  interface FetchHeadersInit {
    [name: string]: string
  }

  interface FetchInit {
    readonly method?: string
    readonly headers?: FetchHeadersInit
    readonly body?: string | Uint8Array
    readonly signal?: AbortSignal
    readonly redirect?: 'follow' | 'manual' | 'error'
  }

  class AbortSignal {
    readonly aborted: boolean
  }

  class AbortController {
    readonly signal: AbortSignal

    constructor()
    abort(): void
  }

  function fetch(url: string, init?: FetchInit): Promise<Response>
}
