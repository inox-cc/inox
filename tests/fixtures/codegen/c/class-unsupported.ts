// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_CLASS

class User {
  constructor(name: string) {
    this.name = name
  }

  greet(prefix: string): void {
    console.log(prefix, this.name)
  }
}

export function main(): void {
  const user = new User('Ada')
  user.greet('hello')
}
