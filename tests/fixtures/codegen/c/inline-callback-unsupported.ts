// @targets c
// @expect diagnostic
// @diagnostic INOX_C_FUNCTION_VALUE

function run(callback: Function): void {
  callback()
}

let values = [1]
run(() => {
  console.log(values.length)
})

