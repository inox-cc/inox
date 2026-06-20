// @targets c
// @expect pass
// @stdout Hello Ada

function greet(name: string): string {
  return 'Hello ' + name
}

console.log(greet('Ada'))
