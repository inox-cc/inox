import type { Buffer } from 'node:buffer'

export type ZlibInput = string | Uint8Array

export interface ZlibModule {
  deflateSync(data: ZlibInput): Buffer
  inflateSync(data: ZlibInput): Buffer
  deflateRawSync(data: ZlibInput): Buffer
  inflateRawSync(data: ZlibInput): Buffer
  gzipSync(data: ZlibInput): Buffer
  gunzipSync(data: ZlibInput): Buffer
}

export function deflateSync(data: ZlibInput): Buffer
export function inflateSync(data: ZlibInput): Buffer
export function deflateRawSync(data: ZlibInput): Buffer
export function inflateRawSync(data: ZlibInput): Buffer
export function gzipSync(data: ZlibInput): Buffer
export function gunzipSync(data: ZlibInput): Buffer

declare const zlib: ZlibModule
export default zlib
