#ifndef CCJS_PATH_H
#define CCJS_PATH_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

ccjs_status ccjs_path_basename(ccjs_allocator* allocator, ccjs_value path, ccjs_value suffix, int has_suffix, ccjs_value* out);
ccjs_status ccjs_path_dirname(ccjs_allocator* allocator, ccjs_value path, ccjs_value* out);
ccjs_status ccjs_path_extname(ccjs_allocator* allocator, ccjs_value path, ccjs_value* out);
ccjs_status ccjs_path_is_absolute(ccjs_value path, int* out);
ccjs_status ccjs_path_join(ccjs_allocator* allocator, const ccjs_value* paths, size_t path_count, ccjs_value* out);
ccjs_status ccjs_path_normalize(ccjs_allocator* allocator, ccjs_value path, ccjs_value* out);
ccjs_status ccjs_path_relative(ccjs_allocator* allocator, ccjs_value from, ccjs_value to, ccjs_value* out);
ccjs_status ccjs_path_resolve(ccjs_allocator* allocator, const ccjs_value* paths, size_t path_count, ccjs_value* out);

#endif
