// @targets c
// @expect diagnostics INOX_MODULE_NOT_FOUND

import { missing } from './missing.ts'
console.log(missing)
