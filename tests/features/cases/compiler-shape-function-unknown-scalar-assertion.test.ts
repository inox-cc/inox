// @targets cc
// @expect pass
// @stdout 8
// @stdout 1

function parseUnknown(source: string): unknown {
  if (source === 'true') return true
  return Number(source)
}

console.log(parseUnknown('8') as number)
console.log((parseUnknown('true') as boolean) === true)
