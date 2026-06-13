// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_ASYNC

export function main(): void {
  let total = 0
  const promise = Promise.resolve(1).then(value => {
    total = total + value

    return total
  })
}
