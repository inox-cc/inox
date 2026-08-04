// @targets js cc
// @expect pass
// @stdout Ada Grace

const names = new Map<number, string>([
  [1, 'Ada'],
  [2, 'Grace']
])

console.log(Array.from(names.values()).join(' '))
