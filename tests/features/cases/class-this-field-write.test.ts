// @targets c
// @expect pass
// @stdout Grace

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  rename(name: string): void {
    this.name = name
  }
}

const user = new User('Ada')
user.rename('Grace')
console.log(user.name)
