#ifndef CCJS_CHILD_PROCESS_H
#define CCJS_CHILD_PROCESS_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/object.h"
#include "ccjs/value.h"

ccjs_status ccjs_child_process_exec_sync(ccjs_allocator* allocator, ccjs_value command, ccjs_value options, ccjs_value* out);
ccjs_status ccjs_child_process_exec_file_sync(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  ccjs_value options,
  ccjs_value* out
);
ccjs_status ccjs_child_process_spawn_sync(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  ccjs_value options,
  const ccjs_shape* shape,
  ccjs_value* out
);

#endif
