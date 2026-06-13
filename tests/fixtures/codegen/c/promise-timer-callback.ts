// @targets c
// @expect pass
// @stdout timer 1

export function main(): void {
  const pending = Promise.resolve(1).then(value => {
    setTimeout(() => {
      console.log('timer', value)
    }, 1)

    return value
  })
}
