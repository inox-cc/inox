// @targets cc
// @expect pass
// @stdout 3

class Collector {
  values: number[]

  constructor(source: number[]) {
    this.values = []

    for (let index = 0; index < source.length; index = index + 1) {
      this.values.push(source[index])
    }
  }
}

const collector = new Collector([1, 2, 3])
console.log(collector.values.length)
