// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

import net from 'node:net'
net.createServer(() => {})
