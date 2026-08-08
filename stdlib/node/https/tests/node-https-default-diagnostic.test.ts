// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import https from 'node:https'
https.get('https://localhost/')
