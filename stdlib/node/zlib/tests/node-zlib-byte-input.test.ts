// @targets js cc
// @expect pass
// @stdout bytes default

import { Buffer } from 'node:buffer'
import zlib from 'node:zlib'

const source = new Uint8Array([98, 121, 116, 101, 115])
const compressed = zlib.gzipSync(source)

console.log(
  zlib.gunzipSync(compressed).toString(),
  zlib.inflateSync(zlib.deflateSync(Buffer.from('default'))).toString()
)
