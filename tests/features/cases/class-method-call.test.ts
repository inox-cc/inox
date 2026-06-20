// @targets c
// @expect pass
// @stdout Ada

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  greet(): string {
    return this.name
  }
}

const user = new User('Ada')
console.log(user.greet())
