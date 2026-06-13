// @targets c
// @platforms embedded
// @features fs,timers,wall-clock,monotonic-clock
// @expect pass

import fs from 'node:fs'

function onTimer(): void {
  console.log('timer')
}

const wall = Date.now()
const monotonic = performance.now()
const timeout = setTimeout(onTimer, 1)

fs.promises.writeFile('/private/tmp/ccjs-embedded-profile.txt', 'saved')
clearTimeout(timeout)
console.log('ok', wall, monotonic)
