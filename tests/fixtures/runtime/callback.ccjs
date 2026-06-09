// @targets js
// @expect pass

function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

export function main(): void {
  const callback: Function = hello
  run(callback)
}
