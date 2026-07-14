// @targets cc
// @expect pass
// @stdout 2

class Counter {
  value: number = 0

  update(): number {
    this.value = Math.min(2, 3)
    return this.value
  }
}

const counter = new Counter()
console.log(counter.update())
