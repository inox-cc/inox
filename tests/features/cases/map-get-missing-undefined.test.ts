// @targets c
// @expect pass
// @stdout missing

const values: Map<string, string> = new Map()
const value = values.get('missing')

if (typeof value === 'undefined') {
  console.log('missing')
} else {
  console.log(value ?? 'null')
}
