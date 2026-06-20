// @targets c
// @expect pass
// @stdout sorted:1
// @stdout 4
// @stdout 0
// @stdout strings:Ada/b/2
// @stdout predicates:yes
// @stdout indexes:2/5

const values = [3, 1, 2]
values.sort()
console.log('sorted:' + String(values[0]))

const stack: number[] = [4]
console.log(stack.pop() ?? 0)
console.log(stack.length)

const phrase = '  Ada  '
const parts = 'a,b'.split(',')
const trimmed = phrase.trim()

let predicate = 'no'

if (trimmed.includes('d') && trimmed.startsWith('A') && trimmed.endsWith('a')) {
  predicate = 'yes'
}

console.log('strings:' + trimmed.slice(0, 3) + '/' + parts[1] + '/' + String(parts.length))
console.log('predicates:' + predicate)
console.log('indexes:' + String(trimmed.indexOf('a')) + '/' + String('bananas'.lastIndexOf('a')))
