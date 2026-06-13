import { asyncFunction } from './async.ts'
import { addScore, scaleScore } from './score.ts'
import { userName } from './user.ts'

const base = addScore(12, 8)
const total = scaleScore(base, 3)

console.log('hello', userName(), 'score', total)

const str = await asyncFunction()
console.log('Async res:', str)
