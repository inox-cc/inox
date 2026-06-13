// @targets c
// @expect pass
// @stdout typed

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

const callback: StringCallback = hello
run(callback)

