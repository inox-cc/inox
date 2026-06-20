// @targets c
// @expect pass
// @stdout slept

import time from 'time'
await time.sleep(0)
console.log('slept')
