// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FUNCTION_VALUE

function run(callback: Function): void {
  callback()
}

export function main(): void {
  run(() => {
    console.log('inline')
  })
}
