// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import { parse } from 'node:url'
parse('https://example.com')
