// @targets cc
// @expect pass
// @stdout ADA

class Box<T> {
  values: T[]

  constructor(values: T[]) {
    this.values = values
  }
}

const box = new Box(['Ada'])
console.log(box.values[0].toUpperCase())
