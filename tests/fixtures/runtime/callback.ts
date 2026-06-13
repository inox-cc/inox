// @targets js,c
// @expect pass

function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

const callback: Function = hello
run(callback)

