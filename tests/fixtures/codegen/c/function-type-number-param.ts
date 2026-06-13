// @targets c
// @expect pass

type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

function hello(value: number): void {
  console.log(value)
}

const callback: NumberCallback = hello
run(callback)

