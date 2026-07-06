#ifndef INOX_CHILD_PROCESS_H
#define INOX_CHILD_PROCESS_H

#include <stddef.h>
#include "inox/object.h"
#include "inox/string.h"
#include "inox/value.h"

#ifdef __cplusplus

class child_process {
public:
  inox::String execSync(inox_value command, inox_value options) const;
  inox::String execFileSync(inox_value file, const inox_value* args, size_t arg_count, inox_value options) const;
  inox::Value spawnSync(
    inox_value file,
    const inox_value* args,
    size_t arg_count,
    inox_value options,
    const inox_shape* shape
  ) const;
};

extern child_process child_process;

#endif

#endif
