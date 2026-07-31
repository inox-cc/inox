// @targets cc
// @expect pass
// @stdout ADA

function unwrap<T>(box: { value: T }): T {
  return box.value
}

const value = unwrap({ value: 'Ada' })
console.log(value.toUpperCase())
