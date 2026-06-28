// @targets cc
// @expect pass
// @stdout 8

class Counter {
  add(value: number, step: number = 3): number {
    return value + step
  }
}

const counter = new Counter()
console.log(counter.add(5))
