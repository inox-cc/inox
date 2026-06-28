#ifndef INOX_PATH_H
#define INOX_PATH_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/object.h"
#include "inox/value.h"

inox_status inox_path_basename(inox_allocator* allocator, inox_value path, inox_value suffix, int has_suffix, inox_value* out);
inox_status inox_path_dirname(inox_allocator* allocator, inox_value path, inox_value* out);
inox_status inox_path_extname(inox_allocator* allocator, inox_value path, inox_value* out);
inox_status inox_path_is_absolute(inox_value path, int* out);
inox_status inox_path_join(inox_allocator* allocator, const inox_value* paths, size_t path_count, inox_value* out);
inox_status inox_path_format(inox_allocator* allocator, inox_value path_object, inox_value* out);
inox_status inox_path_normalize(inox_allocator* allocator, inox_value path, inox_value* out);
inox_status inox_path_parse(inox_allocator* allocator, inox_value path, const inox_shape* shape, inox_value* out);
inox_status inox_path_relative(inox_allocator* allocator, inox_value from, inox_value to, inox_value* out);
inox_status inox_path_resolve(inox_allocator* allocator, const inox_value* paths, size_t path_count, inox_value* out);

#ifdef __cplusplus
}
#endif

#endif
