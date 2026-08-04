// @targets cc
// @expect pass
// @stdout a=1|b=2|a=3
// @stdout a|b|a
// @stdout 1|2|3
// @stdout a:1|b:2|a:3
// @stdout a=1|b=2|c=3

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('a=1&b=2&a=3')
const entries: string[] = []
const keys: string[] = []
const values: string[] = []
const explicit: string[] = []

for (const [key, value] of params) {
  entries.push(key + '=' + value)
}

for (const key of params.keys()) {
  keys.push(key)
}

for (const value of params.values()) {
  values.push(value)
}

for (const entry of params.entries()) {
  explicit.push(entry.join(':'))
}

const live = new URLSearchParams('a=1&b=2')
const visited: string[] = []

live.forEach((value, key, owner) => {
  visited.push(key + '=' + value)

  if (key === 'a') {
    owner.append('c', '3')
  }
})

console.log(entries.join('|'))
console.log(keys.join('|'))
console.log(values.join('|'))
console.log(explicit.join('|'))
console.log(visited.join('|'))
