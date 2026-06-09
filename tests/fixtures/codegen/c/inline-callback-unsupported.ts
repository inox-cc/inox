// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FUNCTION_VALUE

function run(callback: Function): void {
  callback()
}

export function main(): void {
  let values = [1]
  run(() => {
    console.log(values.length)
  })
}
