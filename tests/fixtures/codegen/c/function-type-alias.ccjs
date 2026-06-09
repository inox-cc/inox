// @targets c
// @expect pass

type Done = () => void;

function run(callback: Done): void {
  callback()
}

function hello(): void {
  console.log('typed')
}

export function main(): void {
  const callback: Done = hello
  run(callback)
}
