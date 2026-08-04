// @targets cc
// @expect pass
// @stdout 1 0 1 1 1 0 1 0

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  greet(): string {
    return this.name
  }
}

const record = { name: 'Ada' }
const values = [10, 20]
const user = new User('Grace')

console.log(
  Object.hasOwn(record, 'name'),
  Object.hasOwn(record, 'missing'),
  Object.hasOwn(values, 1),
  Object.hasOwn(values, 'length'),
  Object.hasOwn(user, 'name'),
  Object.hasOwn(user, 'greet'),
  Object.hasOwn('inox', 2),
  Object.hasOwn('inox', 4)
)
