// @targets js cc
// @expect pass
// @stdout sync
// @stdout tick
// @stdout promise

import { nextTick } from 'node:process'

Promise.resolve('promise').then((value) => {
  console.log(value)
  return value
})
nextTick(() => console.log('tick'))
console.log('sync')
