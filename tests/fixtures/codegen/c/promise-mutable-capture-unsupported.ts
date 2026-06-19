// @targets c
// @expect diagnostic
// @diagnostic INOX_C_ASYNC

let total = 0
const promise = Promise.resolve(1).then(value => {
  total = total + value

  return total
})

