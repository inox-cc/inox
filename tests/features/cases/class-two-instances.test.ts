// @targets cc
// @expect pass
// @stdout 3

class Counter {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const first = new Counter(1)
const second = new Counter(2)
first.value = first.value + second.value
console.log(first.value)
