// @targets c
// @expect pass

class User {
  constructor(name: string) {
    this.name = name
  }

  greet(): void {
    console.log(this.name)
  }
}

const user = new User('Ada')
user.greet()

