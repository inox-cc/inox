// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_CLASS

class User {
  constructor(name: string) {
    this.name = name
  }
}

export function main(): void {
  const user = new User('Ada')
  console.log(user)
}
