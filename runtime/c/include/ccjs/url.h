#ifndef CCJS_URL_H
#define CCJS_URL_H

#include "ccjs/allocator.h"
#include "ccjs/object.h"
#include "ccjs/value.h"

ccjs_status ccjs_url_file_url_to_path(ccjs_allocator* allocator, ccjs_value url, ccjs_value* out);
ccjs_status ccjs_url_path_to_file_url(ccjs_allocator* allocator, ccjs_value path, const ccjs_shape* shape, ccjs_value* out);
ccjs_status ccjs_url_new(
  ccjs_allocator* allocator,
  ccjs_value input,
  ccjs_value base,
  int has_base,
  const ccjs_shape* shape,
  ccjs_value* out
);
ccjs_status ccjs_url_set_field(ccjs_allocator* allocator, ccjs_value url, uint32_t field_index, ccjs_value value);
ccjs_status ccjs_url_search_params_new(ccjs_allocator* allocator, ccjs_value init, const ccjs_shape* shape, ccjs_value* out);
ccjs_status ccjs_url_search_params_get(
  ccjs_allocator* allocator,
  ccjs_value params,
  const char* name,
  size_t name_len,
  ccjs_value* out
);
ccjs_status ccjs_url_search_params_has(ccjs_value params, const char* name, size_t name_len, int* out);
ccjs_status ccjs_url_search_params_set(
  ccjs_allocator* allocator,
  ccjs_value params,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
ccjs_status ccjs_url_search_params_append(
  ccjs_allocator* allocator,
  ccjs_value params,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
ccjs_status ccjs_url_search_params_delete(ccjs_allocator* allocator, ccjs_value params, const char* name, size_t name_len);
ccjs_status ccjs_url_search_params_to_string(ccjs_allocator* allocator, ccjs_value params, ccjs_value* out);

#endif
