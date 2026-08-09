// @targets js cc
// @expect pass
// @stdout -_8 -_8 fbff

import { Buffer } from 'node:buffer'

const bytes = Buffer.from('fbff', 'hex')
const url = bytes.toString('base64url')
const regular = Buffer.from('+/8=', 'base64url')

console.log(url, regular.toString('base64url'), Buffer.from(url, 'base64').toString('hex'))
