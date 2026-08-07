import type { LookupAddress, LookupOptions } from '../index'

export interface DnsPromisesModule {
  lookup(hostname: string, family?: number): Promise<LookupAddress>
  lookup(hostname: string, options: LookupOptions): Promise<LookupAddress>
}

export function lookup(hostname: string, family?: number): Promise<LookupAddress>
export function lookup(hostname: string, options: LookupOptions): Promise<LookupAddress>

declare const dnsPromises: DnsPromisesModule
export default dnsPromises
