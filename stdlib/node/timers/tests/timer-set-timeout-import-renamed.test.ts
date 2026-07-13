// @targets cc
// @expect pass
// @stdout renamed

import { setTimeout as later } from 'node:timers'

later(() => {
  console.log('renamed')
}, 0)
