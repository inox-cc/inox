#ifndef INOX_URL_H
#define INOX_URL_H

#ifdef __cplusplus
extern "C" {
#endif

#include "inox/allocator.h"
#include "inox/object.h"
#include "inox/value.h"

inox_status inox_url_file_url_to_path(inox_allocator* allocator, inox_value url, inox_value* out);
inox_status inox_url_path_to_file_url(inox_allocator* allocator, inox_value path, const inox_shape* shape, inox_value* out);
inox_status inox_url_new(
  inox_allocator* allocator,
  inox_value input,
  inox_value base,
  int has_base,
  const inox_shape* shape,
  inox_value* out
);
inox_status inox_url_set_field(inox_allocator* allocator, inox_value url, uint32_t field_index, inox_value value);
inox_status inox_url_search_params_new(inox_allocator* allocator, inox_value init, const inox_shape* shape, inox_value* out);
inox_status inox_url_search_params_get(
  inox_allocator* allocator,
  inox_value params,
  const char* name,
  size_t name_len,
  inox_value* out
);
inox_status inox_url_search_params_has(inox_value params, const char* name, size_t name_len, int* out);
inox_status inox_url_search_params_set(
  inox_allocator* allocator,
  inox_value params,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
inox_status inox_url_search_params_append(
  inox_allocator* allocator,
  inox_value params,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
inox_status inox_url_search_params_delete(inox_allocator* allocator, inox_value params, const char* name, size_t name_len);
inox_status inox_url_search_params_to_string(inox_allocator* allocator, inox_value params, inox_value* out);

#ifdef __cplusplus
}
#endif

#endif
