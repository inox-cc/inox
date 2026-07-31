// @targets cc
// @expect pass
// @stdout ADA

class Box<T> {
  value: T

  constructor(value: T) {
    this.value = value
  }
}

const box = new Box<
  string
>('Ada')

console.log(box.value.toUpperCase())
