// @targets cc
// @expect pass
// @stdout missing
// @stdout ready

function read(values?: Map<string, string>): string {
  return values?.get('key') ?? 'missing'
}

const values = new Map<string, string>()
values.set('key', 'ready')

console.log(read())
console.log(read(values))
