// @targets cc
// @expect pass
// @stdout done

import { setTimeout } from 'node:timers/promises'

await setTimeout()
console.log('done')
