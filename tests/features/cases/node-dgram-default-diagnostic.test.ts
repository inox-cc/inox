// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

import dgram from 'node:dgram'
dgram.createSocket('udp4')
