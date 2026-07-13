// @targets cc
// @expect pass
// @stdout missing
// @stdout ready

function selected(value?: string): string {
  if (value) {
    return value
  }

  return 'missing'
}

console.log(selected())
console.log(selected('ready'))
