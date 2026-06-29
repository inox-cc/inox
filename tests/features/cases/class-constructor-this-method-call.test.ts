// @targets cc
// @expect pass
// @stdout Ada

class User {
  name: string

  constructor(name: string) {
    this.rename(name)
  }

  rename(name: string): void {
    this.name = name
  }
}

const user = new User('Ada')
console.log(user.name)
