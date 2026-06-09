// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FUNCTION_VALUE

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

export function main(): void {
  const callback: StringCallback = hello
  run(callback)
}
