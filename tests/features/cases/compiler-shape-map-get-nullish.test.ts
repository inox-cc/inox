// @targets c
// @expect pass
// @stdout compiler:none

type LookupResult = {
  primary: string
  missing: string
}

function readOptions(options: Map<string, string>): LookupResult {
  return {
    primary: options.get('name') ?? 'none',
    missing: options.get('missing') ?? 'none'
  }
}

const options: Map<string, string> = new Map()
options.set('name', 'compiler')
const result = readOptions(options)
console.log(`${result.primary}:${result.missing}`)
