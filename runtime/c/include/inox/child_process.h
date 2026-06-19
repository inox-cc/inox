#ifndef INOX_CHILD_PROCESS_H
#define INOX_CHILD_PROCESS_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/object.h"
#include "inox/value.h"

inox_status inox_child_process_exec_sync(inox_allocator* allocator, inox_value command, inox_value options, inox_value* out);
inox_status inox_child_process_exec_file_sync(
  inox_allocator* allocator,
  inox_value file,
  const inox_value* args,
  size_t arg_count,
  inox_value options,
  inox_value* out
);
inox_status inox_child_process_spawn_sync(
  inox_allocator* allocator,
  inox_value file,
  const inox_value* args,
  size_t arg_count,
  inox_value options,
  const inox_shape* shape,
  inox_value* out
);

#endif
