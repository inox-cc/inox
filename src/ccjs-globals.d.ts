declare const crypto: {
  getRandomValues<T extends Buffer | Uint8Array>(bytes: T): T
}

type FetchResponse = {
  readonly status: number
  readonly ok: boolean
  readonly url: string
  text(): Promise<string>
}

declare function fetch(url: string): Promise<FetchResponse>
