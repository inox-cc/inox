// @targets cc
// @expect pass
// @stdout missing
// @stdout INOX

function firstUpper(values?: string[]): string {
  const mapped = values?.map((value) => value.toUpperCase())
  return mapped?.[0] ?? 'missing'
}

console.log(firstUpper())
console.log(firstUpper(['inox']))
