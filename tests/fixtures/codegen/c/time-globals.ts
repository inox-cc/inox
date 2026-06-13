// @targets c
// @expect pass

const started = Date.now()
const elapsed = performance.now()
console.log(started >= 0, elapsed >= 0)

