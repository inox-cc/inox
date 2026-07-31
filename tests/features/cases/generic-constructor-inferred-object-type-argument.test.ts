// @targets cc
// @expect pass
// @stdout ADA

class Box<T> {
  value: T

  constructor(value: T) {
    this.value = value
  }
}

const box = new Box({ name: 'Ada' })
console.log(box.value.name.toUpperCase())
