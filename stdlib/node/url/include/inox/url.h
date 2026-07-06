#ifndef INOX_URL_H
#define INOX_URL_H

#include "inox/allocator.h"
#include "inox/object.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

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

#ifdef __cplusplus

#include "inox/string.h"
#include "inox/string_view.h"

class URLSearchParams : public inox::Value {
private:
  static inox::Value make(inox_value init);
  static inox::Value make(inox::StringView init);

public:
  URLSearchParams();
  explicit URLSearchParams(inox::StringView init);
  explicit URLSearchParams(inox_value value);
  explicit URLSearchParams(const inox::Value& value);
  URLSearchParams(inox::AdoptValue adopt, inox_value value);

  using inox::Value::operator=;

  static URLSearchParams from(inox_value init);
  static URLSearchParams from(const inox::Value& init);

  bool valid() const;
  void append(inox::StringView name, inox::StringView value);
  inox::Value get(inox::StringView name) const;
  bool has(inox::StringView name) const;
  void remove(inox::StringView name);
  void set(inox::StringView name, inox::StringView value);
  inox::String toString() const;
};

#endif

#endif
