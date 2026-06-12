// @targets c
// @platforms embedded
// @features fs,timers,wall-clock,monotonic-clock
// @expect pass

function onTimer(): void {
  console.log('timer')
}

export function main(): void {
  const wall = Date.now()
  const monotonic = performance.now()
  const timeout = setTimeout(onTimer, 1)

  fs.writeFile('/private/tmp/ccjs-embedded-profile.txt', 'saved')
  clearTimeout(timeout)
  console.log('ok', wall, monotonic)
}
