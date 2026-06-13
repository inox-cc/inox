// @targets c
// @expect pass
// @stdout hello Ada

class User {
  constructor(name: string) {
    this.name = name
  }

  greet(prefix: string): void {
    console.log(prefix, this.name)
  }
}

const user = new User('Ada')
user.greet('hello')

