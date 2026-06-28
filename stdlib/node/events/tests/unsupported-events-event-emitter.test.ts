// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import { EventEmitter } from 'node:events'
new EventEmitter()
