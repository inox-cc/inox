// @targets cc
// @expect pass
// @stdout 9

class Counter {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const counter = new Counter(4)
counter.value = 9
console.log(counter.value)
