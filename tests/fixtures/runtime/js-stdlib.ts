// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_NULLISH

const started = Date.now()
const precise = performance.now()
console.log(started > 0, precise >= 0)

const set = new Set([1, 2])
const map = new Map([['answer', 42]])
console.log(set.has(2), map.get('answer'))

const name = 'Ada'
console.log(`hello ${name}`)
