#ifndef INOX_CHILD_PROCESS_H
#define INOX_CHILD_PROCESS_H

#include <stddef.h>
#include "inox/object.h"
#include "inox/string.h"
#include "inox/value.h"

#ifdef __cplusplus

class child_process {
public:
  inox::String execSync(inox::StringView command, const inox::Value& options) const;
  inox::String execFileSync(inox::StringView file, const inox::StringView* args, size_t arg_count, const inox::Value& options) const;
  inox::Value spawnSync(
    inox::StringView file,
    const inox::StringView* args,
    size_t arg_count,
    const inox::Value& options
  ) const;
};

extern child_process child_process;

#endif

#endif
