// @targets cc
// @expect pass
// @stdout captured 7 true

export function reportLater(value: number, enabled: boolean): void {
  setTimeout(() => {
    console.log('captured', String(value), String(enabled))
  }, 0)
}

reportLater(7, true)
