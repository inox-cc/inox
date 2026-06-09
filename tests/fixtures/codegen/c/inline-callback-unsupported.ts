// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FUNCTION_VALUE

function run(callback: Function): void {
  callback()
}

export function main(): void {
  let label = 'inline'
  run(() => {
    console.log(label)
  })
}
