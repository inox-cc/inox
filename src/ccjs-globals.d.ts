declare const crypto: {
  getRandomValues<T extends Buffer | Uint8Array>(bytes: T): T
}

type FetchResponse = {
  readonly status: number
  readonly ok: boolean
  readonly url: string
  text(): Promise<string>
}

type FetchInit = {
  readonly method?: string
  readonly headers?: {
    readonly [name: string]: string
  }
  readonly body?: string | Buffer | Uint8Array
}

declare function fetch(url: string, init?: FetchInit): Promise<FetchResponse>
