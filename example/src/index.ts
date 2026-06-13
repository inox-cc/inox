import { asyncText } from './async.ts'
import { addScore, scaleScore } from './score.ts'
import { fsTest } from './fs.ts'

const base = addScore(12, 8)
const total = scaleScore(base, 3)

console.log('hello', 'world', total)
const str = await asyncText()
console.log('text', str)
let i = 0

const interval = setInterval(() => {
  console.log(`interval ${++i}`)
}, 1000)

setTimeout(() => {
  clearInterval(interval)
}, 3100)

await fsTest()
