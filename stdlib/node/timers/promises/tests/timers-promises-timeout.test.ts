// @targets cc
// @expect pass
// @stdout done

import { setTimeout } from 'node:timers/promises'

console.log(await setTimeout(1, 'done'))
