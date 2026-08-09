// @targets js cc
// @expect pass
// @stdout caught

import { gunzipSync } from 'node:zlib'

try {
  gunzipSync(new Uint8Array([1, 2, 3]))
} catch {
  console.log('caught')
}
