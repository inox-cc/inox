// @targets c
// @expect pass
// @stdout count:5
// @stdout total:16
// @stdout evens:3
// @stdout mapped:8
// @stdout first-large:4
// @stdout flags:yes/no
// @stdout walked:1,2,4

const values: number[] = []
values.push(1)
values.push(2)
values.push(3)
values.push(4)
values.push(5)

values[2] = values[2] + 1

const evens = values.filter((value) => value === 2 || value === 4)
const mapped = evens.map((value) => value * 2)
const firstLarge = values.find((value) => value > 3) ?? 0
let total = 0

for (const value of values) {
  total = total + value
}

let walked = ''

for (let index = 0; index < values.length; index++) {
  if (index === 2) {
    continue
  }

  if (index === 4) {
    break
  }

  if (walked.length > 0) {
    walked = walked + ','
  }

  walked = walked + String(values[index])
}

let hasTwo = 'no'
let hasThree = 'no'

if (values.includes(2)) {
  hasTwo = 'yes'
}

if (values.includes(3)) {
  hasThree = 'yes'
}

console.log('count:' + String(values.length))
console.log('total:' + String(total))
console.log('evens:' + String(evens.length))
console.log('mapped:' + String(mapped[1]))
console.log('first-large:' + String(firstLarge))
console.log('flags:' + hasTwo + '/' + hasThree)
console.log('walked:' + walked)
