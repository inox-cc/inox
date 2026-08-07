export interface LookupAddress {
  readonly address: string
  readonly family: number
}

export interface LookupOptions {
  readonly family?: number
}

export type LookupCallback = (error: Error | null, address: string, family: number) => void

export interface DnsPromises {
  lookup(hostname: string, family?: number): Promise<LookupAddress>
  lookup(hostname: string, options: LookupOptions): Promise<LookupAddress>
}

export interface DnsModule {
  readonly promises: DnsPromises

  lookup(hostname: string, callback: LookupCallback): void
  lookup(hostname: string, family: number, callback: LookupCallback): void
  lookup(hostname: string, options: LookupOptions, callback: LookupCallback): void
}

export function lookup(hostname: string, callback: LookupCallback): void
export function lookup(hostname: string, family: number, callback: LookupCallback): void
export function lookup(hostname: string, options: LookupOptions, callback: LookupCallback): void

declare const dns: DnsModule
export default dns
