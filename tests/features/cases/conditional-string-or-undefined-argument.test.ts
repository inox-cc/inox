// @targets cc
// @expect pass
// @stdout function

function selectedValue(flag: boolean, value?: string): string | null {
  return flag ? value ?? null : null
}

function contextualValue(flag: boolean): string | null {
  return selectedValue(true, flag ? 'function' : undefined)
}

console.log(contextualValue(true))
