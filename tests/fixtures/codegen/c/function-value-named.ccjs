// @targets c
// @expect pass

function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

export function main(): void {
  run(hello)
}
