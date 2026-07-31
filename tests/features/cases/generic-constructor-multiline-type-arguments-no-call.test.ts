// @targets cc
// @expect pass
// @stdout Ada

class Box<T> {
  value: string

  constructor() {
    this.value = 'Ada'
  }
}

const box = new Box<
  string
>

console.log(box.value)
