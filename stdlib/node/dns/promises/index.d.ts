import type { LookupAddress, LookupAllOptions, LookupOneOptions, LookupServiceResult } from '../index'

export interface DnsPromisesModule {
  lookup(hostname: string, family?: number): Promise<LookupAddress>
  lookup(hostname: string, options: LookupOneOptions): Promise<LookupAddress>
  lookup(hostname: string, options: LookupAllOptions): Promise<LookupAddress[]>
  lookupService(address: string, port: number): Promise<LookupServiceResult>
}

export function lookup(hostname: string, family?: number): Promise<LookupAddress>
export function lookup(hostname: string, options: LookupOneOptions): Promise<LookupAddress>
export function lookup(hostname: string, options: LookupAllOptions): Promise<LookupAddress[]>
export function lookupService(address: string, port: number): Promise<LookupServiceResult>

declare const dnsPromises: DnsPromisesModule
export default dnsPromises
