// @targets cc
// @expect pass
// @stdout 2
// @stdout 1

let calls = 0

function start(): number {
  calls = calls + 1
  return calls
}

function discardResult(): boolean {
  const result = void start()
  return typeof result === 'undefined'
}

void start()
const isUndefined = discardResult()

console.log(calls)
console.log(isUndefined)
