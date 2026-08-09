// @targets js cc
// @expect pass
// @stdout gzip deflate raw

import { deflateRawSync, deflateSync, gzipSync, gunzipSync, inflateRawSync, inflateSync } from 'node:zlib'

console.log(
  gunzipSync(gzipSync('gzip')).toString(),
  inflateSync(deflateSync('deflate')).toString(),
  inflateRawSync(deflateRawSync('raw')).toString()
)
