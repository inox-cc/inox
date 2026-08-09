// @targets js cc
// @expect pass
// @stdout inox inox 2 1a

import { Buffer } from 'node:buffer'

const hexEncoding = 'HEX'

console.log(
  Buffer.from('inox', 'UTF-8').toString('UTF8'),
  Buffer.from('aW5veA==', 'BASE64').toString(),
  Buffer.byteLength('½', 'unknown'),
  Buffer.from('1A', hexEncoding).toString('hex')
)
