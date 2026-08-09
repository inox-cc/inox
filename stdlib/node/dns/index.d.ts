export interface LookupAddress {
  readonly address: string
  readonly family: number
}

export interface LookupOptions {
  readonly family?: number
  readonly all?: boolean
  readonly order?: 'verbatim' | 'ipv4first' | 'ipv6first'
}

export interface LookupOneOptions extends LookupOptions {
  readonly all?: false
}

export interface LookupAllOptions extends LookupOptions {
  readonly all: true
}

export interface LookupServiceResult {
  readonly hostname: string
  readonly service: string
}

export type LookupCallback = (error: Error | null, address: string, family: number) => void
export type LookupAllCallback = (error: Error | null, addresses: LookupAddress[]) => void
export type LookupServiceCallback = (error: Error | null, hostname: string, service: string) => void

export interface DnsPromises {
  lookup(hostname: string, family?: number): Promise<LookupAddress>
  lookup(hostname: string, options: LookupOneOptions): Promise<LookupAddress>
  lookup(hostname: string, options: LookupAllOptions): Promise<LookupAddress[]>
  lookupService(address: string, port: number): Promise<LookupServiceResult>
}

export interface DnsModule {
  readonly promises: DnsPromises

  lookup(hostname: string, callback: LookupCallback): void
  lookup(hostname: string, family: number, callback: LookupCallback): void
  lookup(hostname: string, options: LookupOneOptions, callback: LookupCallback): void
  lookup(hostname: string, options: LookupAllOptions, callback: LookupAllCallback): void
  lookupService(address: string, port: number, callback: LookupServiceCallback): void
}

export function lookup(hostname: string, callback: LookupCallback): void
export function lookup(hostname: string, family: number, callback: LookupCallback): void
export function lookup(hostname: string, options: LookupOneOptions, callback: LookupCallback): void
export function lookup(hostname: string, options: LookupAllOptions, callback: LookupAllCallback): void
export function lookupService(address: string, port: number, callback: LookupServiceCallback): void

declare const dns: DnsModule
export default dns
