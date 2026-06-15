#include "ccjs/url.h"

#include <ctype.h>
#include <string.h>
#include <unistd.h>
#include "ccjs/string.h"

enum {
  CCJS_URL_HREF_INDEX = 0,
  CCJS_URL_PROTOCOL_INDEX = 1,
  CCJS_URL_HOSTNAME_INDEX = 2,
  CCJS_URL_PORT_INDEX = 3,
  CCJS_URL_PATHNAME_INDEX = 4,
  CCJS_URL_SEARCH_INDEX = 5,
  CCJS_URL_HASH_INDEX = 6
};

enum { CCJS_URL_SEARCH_PARAMS_QUERY_INDEX = 0 };

typedef struct ccjs_url_slice {
  const char* bytes;
  size_t len;
} ccjs_url_slice;

typedef struct ccjs_url_parts {
  ccjs_url_slice href;
  ccjs_url_slice protocol;
  ccjs_url_slice hostname;
  ccjs_url_slice port;
  ccjs_url_slice pathname;
  ccjs_url_slice search;
  ccjs_url_slice hash;
} ccjs_url_parts;

static ccjs_status ccjs_url_string(ccjs_value value, const char** bytes, size_t* len);
static ccjs_status ccjs_url_value_string(ccjs_value value, uint32_t object_field, ccjs_value* retained, const char** bytes, size_t* len);
static ccjs_status ccjs_url_parse(const char* bytes, size_t len, ccjs_url_parts* out);
static int ccjs_url_is_absolute(const char* bytes, size_t len);
static ccjs_status ccjs_url_object_from_parts(
  ccjs_allocator* allocator,
  const ccjs_shape* shape,
  const ccjs_url_parts* parts,
  ccjs_value* out
);
static ccjs_status ccjs_url_init_string_field(
  ccjs_allocator* allocator,
  ccjs_value object,
  uint32_t index,
  const char* bytes,
  size_t len
);
static ccjs_status ccjs_url_build_file_href(ccjs_allocator* allocator, const char* path, size_t path_len, char** out, size_t* out_len);
static ccjs_status ccjs_url_build_relative_href(
  ccjs_allocator* allocator,
  const char* input,
  size_t input_len,
  const ccjs_url_parts* base,
  char** out,
  size_t* out_len
);
static ccjs_status ccjs_url_decode_file_path(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static ccjs_status ccjs_url_normalized_field_value(
  ccjs_allocator* allocator,
  uint32_t field_index,
  const char* bytes,
  size_t len,
  ccjs_value* out
);
static ccjs_status ccjs_url_rebuild_href(ccjs_allocator* allocator, ccjs_value url);
static ccjs_status ccjs_url_search_params_query(ccjs_value params, ccjs_value* retained, const char** bytes, size_t* len);
static ccjs_status ccjs_url_search_params_store_query(ccjs_allocator* allocator, ccjs_value params, const char* bytes, size_t len);
static ccjs_status ccjs_url_search_params_from_string(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static ccjs_status ccjs_url_search_params_from_object(ccjs_allocator* allocator, ccjs_value init, char** out, size_t* out_len);
static ccjs_status ccjs_url_search_params_append_pair(
  ccjs_allocator* allocator,
  char** query,
  size_t* query_len,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
static ccjs_status ccjs_url_search_params_remove_name(
  ccjs_allocator* allocator,
  const char* query,
  size_t query_len,
  const char* encoded_name,
  size_t encoded_name_len,
  char** out,
  size_t* out_len,
  int* removed
);
static int ccjs_url_search_params_has_encoded_name(
  const char* query,
  size_t query_len,
  const char* encoded_name,
  size_t encoded_name_len,
  const char** value,
  size_t* value_len
);
static ccjs_status ccjs_url_encode_query_component(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static ccjs_status ccjs_url_decode_query_component(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static int ccjs_url_should_escape_query_char(unsigned char value);
static char* ccjs_url_alloc(ccjs_allocator* allocator, size_t len);
static int ccjs_url_hex_value(char value);
static int ccjs_url_should_escape_path_char(unsigned char value);
static void ccjs_url_write_hex(char* out, unsigned char value);

ccjs_status ccjs_url_file_url_to_path(ccjs_allocator* allocator, ccjs_value url, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_value retained = ccjs_undefined_value();
  ccjs_status status = ccjs_url_value_string(url, CCJS_URL_HREF_INDEX, &retained, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  if (len < 7 || strncmp(bytes, "file://", 7) != 0) {
    ccjs_release(retained);
    return CCJS_ERR_UNSUPPORTED;
  }

  const char* path = bytes + 7;
  size_t path_len = len - 7;
  size_t host_len = 0;

  while (host_len < path_len && path[host_len] != '/') {
    host_len += 1;
  }

  if (host_len != 0 && !(host_len == 9 && strncmp(path, "localhost", 9) == 0)) {
    ccjs_release(retained);
    return CCJS_ERR_UNSUPPORTED;
  }

  path += host_len;
  path_len -= host_len;

  if (path_len == 0 || path[0] != '/') {
    ccjs_release(retained);
    return CCJS_ERR_UNSUPPORTED;
  }

  char* decoded = 0;
  size_t decoded_len = 0;

  status = ccjs_url_decode_file_path(allocator, path, path_len, &decoded, &decoded_len);

  if (status != CCJS_OK) {
    ccjs_release(retained);
    return status;
  }

  status = ccjs_string_from_literal(allocator, decoded, decoded_len, out);
  allocator->free(allocator->user, decoded, decoded_len + 1, _Alignof(char));
  ccjs_release(retained);

  return status;
}

ccjs_status ccjs_url_path_to_file_url(ccjs_allocator* allocator, ccjs_value path, const ccjs_shape* shape, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_url_string(path, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  char* href = 0;
  size_t href_len = 0;

  status = ccjs_url_build_file_href(allocator, bytes, len, &href, &href_len);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_url_parts parts;
  status = ccjs_url_parse(href, href_len, &parts);

  if (status == CCJS_OK) {
    status = ccjs_url_object_from_parts(allocator, shape, &parts, out);
  }

  allocator->free(allocator->user, href, href_len + 1, _Alignof(char));

  return status;
}

ccjs_status ccjs_url_new(
  ccjs_allocator* allocator,
  ccjs_value input,
  ccjs_value base,
  int has_base,
  const ccjs_shape* shape,
  ccjs_value* out
) {
  const char* input_bytes = 0;
  size_t input_len = 0;
  ccjs_status status = ccjs_url_string(input, &input_bytes, &input_len);

  if (status != CCJS_OK) {
    return status;
  }

  if (ccjs_url_is_absolute(input_bytes, input_len)) {
    ccjs_url_parts parts;
    status = ccjs_url_parse(input_bytes, input_len, &parts);

    return status == CCJS_OK ? ccjs_url_object_from_parts(allocator, shape, &parts, out) : status;
  }

  if (!has_base) {
    return CCJS_ERR_UNSUPPORTED;
  }

  const char* base_bytes = 0;
  size_t base_len = 0;
  ccjs_value retained_base = ccjs_undefined_value();
  ccjs_url_parts base_parts;

  status = ccjs_url_value_string(base, CCJS_URL_HREF_INDEX, &retained_base, &base_bytes, &base_len);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_url_parse(base_bytes, base_len, &base_parts);

  if (status != CCJS_OK) {
    ccjs_release(retained_base);
    return status;
  }

  char* href = 0;
  size_t href_len = 0;

  status = ccjs_url_build_relative_href(allocator, input_bytes, input_len, &base_parts, &href, &href_len);

  if (status != CCJS_OK) {
    ccjs_release(retained_base);
    return status;
  }

  ccjs_url_parts parts;
  status = ccjs_url_parse(href, href_len, &parts);

  if (status == CCJS_OK) {
    status = ccjs_url_object_from_parts(allocator, shape, &parts, out);
  }

  allocator->free(allocator->user, href, href_len + 1, _Alignof(char));
  ccjs_release(retained_base);

  return status;
}

ccjs_status ccjs_url_set_field(ccjs_allocator* allocator, ccjs_value url, uint32_t field_index, ccjs_value value) {
  if (field_index != CCJS_URL_PATHNAME_INDEX && field_index != CCJS_URL_SEARCH_INDEX && field_index != CCJS_URL_HASH_INDEX) {
    return CCJS_ERR_UNSUPPORTED;
  }

  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_url_string(value, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_value normalized = ccjs_undefined_value();
  status = ccjs_url_normalized_field_value(allocator, field_index, bytes, len, &normalized);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(url, field_index, normalized);
  }

  ccjs_release(normalized);

  if (status != CCJS_OK) {
    return status;
  }

  return ccjs_url_rebuild_href(allocator, url);
}

ccjs_status ccjs_url_search_params_new(ccjs_allocator* allocator, ccjs_value init, const ccjs_shape* shape, ccjs_value* out) {
  ccjs_value object = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, shape, &object);

  if (status != CCJS_OK) {
    return status;
  }

  char* query = 0;
  size_t query_len = 0;

  if (init.tag == CCJS_TAG_UNDEFINED || init.tag == CCJS_TAG_NULL) {
    query = ccjs_url_alloc(allocator, 0);

    if (query == 0) {
      status = CCJS_ERR_OOM;
    }
  } else if (init.tag == CCJS_TAG_STRING) {
    const char* bytes = 0;
    size_t len = 0;

    status = ccjs_url_string(init, &bytes, &len);

    if (status == CCJS_OK) {
      status = ccjs_url_search_params_from_string(allocator, bytes, len, &query, &query_len);
    }
  } else if (init.tag == CCJS_TAG_OBJECT) {
    status = ccjs_url_search_params_from_object(allocator, init, &query, &query_len);
  } else {
    status = CCJS_ERR_TYPE;
  }

  if (status == CCJS_OK) {
    status = ccjs_url_search_params_store_query(allocator, object, query, query_len);
  }

  if (query != 0) {
    allocator->free(allocator->user, query, query_len + 1, _Alignof(char));
  }

  if (status == CCJS_OK) {
    *out = object;
    return CCJS_OK;
  }

  ccjs_release(object);
  *out = ccjs_undefined_value();

  return status;
}

ccjs_status ccjs_url_search_params_get(
  ccjs_allocator* allocator,
  ccjs_value params,
  const char* name,
  size_t name_len,
  ccjs_value* out
) {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  ccjs_status status = ccjs_url_encode_query_component(allocator, name, name_len, &encoded_name, &encoded_name_len);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_value retained = ccjs_undefined_value();
  const char* query = 0;
  size_t query_len = 0;
  const char* value = 0;
  size_t value_len = 0;

  status = ccjs_url_search_params_query(params, &retained, &query, &query_len);

  if (status == CCJS_OK && ccjs_url_search_params_has_encoded_name(query, query_len, encoded_name, encoded_name_len, &value, &value_len)) {
    char* decoded = 0;
    size_t decoded_len = 0;

    status = ccjs_url_decode_query_component(allocator, value, value_len, &decoded, &decoded_len);

    if (status == CCJS_OK) {
      status = ccjs_string_from_literal(allocator, decoded, decoded_len, out);
    }

    if (decoded != 0) {
      allocator->free(allocator->user, decoded, decoded_len + 1, _Alignof(char));
    }
  } else if (status == CCJS_OK) {
    *out = ccjs_null_value();
  }

  ccjs_release(retained);
  allocator->free(allocator->user, encoded_name, encoded_name_len + 1, _Alignof(char));

  return status;
}

ccjs_status ccjs_url_search_params_has(ccjs_value params, const char* name, size_t name_len, int* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  if (params.tag != CCJS_TAG_OBJECT || params.as.ref == 0 || params.as.ref->allocator == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = params.as.ref->allocator;
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  ccjs_status status = ccjs_url_encode_query_component(allocator, name, name_len, &encoded_name, &encoded_name_len);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_value retained = ccjs_undefined_value();
  const char* query = 0;
  size_t query_len = 0;

  status = ccjs_url_search_params_query(params, &retained, &query, &query_len);

  if (status == CCJS_OK) {
    *out = ccjs_url_search_params_has_encoded_name(query, query_len, encoded_name, encoded_name_len, 0, 0);
  }

  ccjs_release(retained);
  allocator->free(allocator->user, encoded_name, encoded_name_len + 1, _Alignof(char));

  return status;
}

ccjs_status ccjs_url_search_params_append(
  ccjs_allocator* allocator,
  ccjs_value params,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
) {
  ccjs_value retained = ccjs_undefined_value();
  const char* query_bytes = 0;
  size_t query_len = 0;
  ccjs_status status = ccjs_url_search_params_query(params, &retained, &query_bytes, &query_len);

  if (status != CCJS_OK) {
    return status;
  }

  char* query = ccjs_url_alloc(allocator, query_len);

  if (query == 0) {
    ccjs_release(retained);
    return CCJS_ERR_OOM;
  }

  memcpy(query, query_bytes, query_len);
  ccjs_release(retained);

  status = ccjs_url_search_params_append_pair(allocator, &query, &query_len, name, name_len, value, value_len);

  if (status == CCJS_OK) {
    status = ccjs_url_search_params_store_query(allocator, params, query, query_len);
  }

  allocator->free(allocator->user, query, query_len + 1, _Alignof(char));

  return status;
}

ccjs_status ccjs_url_search_params_delete(ccjs_allocator* allocator, ccjs_value params, const char* name, size_t name_len) {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  ccjs_status status = ccjs_url_encode_query_component(allocator, name, name_len, &encoded_name, &encoded_name_len);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_value retained = ccjs_undefined_value();
  const char* query = 0;
  size_t query_len = 0;

  status = ccjs_url_search_params_query(params, &retained, &query, &query_len);

  char* next = 0;
  size_t next_len = 0;
  int removed = 0;

  if (status == CCJS_OK) {
    status = ccjs_url_search_params_remove_name(allocator, query, query_len, encoded_name, encoded_name_len, &next, &next_len, &removed);
  }

  if (status == CCJS_OK && removed) {
    status = ccjs_url_search_params_store_query(allocator, params, next, next_len);
  }

  if (next != 0) {
    allocator->free(allocator->user, next, next_len + 1, _Alignof(char));
  }

  ccjs_release(retained);
  allocator->free(allocator->user, encoded_name, encoded_name_len + 1, _Alignof(char));

  return status;
}

ccjs_status ccjs_url_search_params_set(
  ccjs_allocator* allocator,
  ccjs_value params,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
) {
  ccjs_status status = ccjs_url_search_params_delete(allocator, params, name, name_len);

  if (status != CCJS_OK) {
    return status;
  }

  return ccjs_url_search_params_append(allocator, params, name, name_len, value, value_len);
}

ccjs_status ccjs_url_search_params_to_string(ccjs_allocator* allocator, ccjs_value params, ccjs_value* out) {
  ccjs_value retained = ccjs_undefined_value();
  const char* query = 0;
  size_t query_len = 0;
  ccjs_status status = ccjs_url_search_params_query(params, &retained, &query, &query_len);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, query, query_len, out);
  }

  ccjs_release(retained);

  return status;
}

static ccjs_status ccjs_url_string(ccjs_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != CCJS_TAG_STRING || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_string* string = (ccjs_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return CCJS_OK;
}

static ccjs_status ccjs_url_value_string(ccjs_value value, uint32_t object_field, ccjs_value* retained, const char** bytes, size_t* len) {
  if (retained == 0) {
    return CCJS_ERR_TYPE;
  }

  *retained = ccjs_undefined_value();

  if (value.tag == CCJS_TAG_OBJECT) {
    ccjs_status status = ccjs_object_get_known(value, object_field, retained);

    if (status != CCJS_OK) {
      return status;
    }

    return ccjs_url_string(*retained, bytes, len);
  }

  return ccjs_url_string(value, bytes, len);
}

static ccjs_status ccjs_url_parse(const char* bytes, size_t len, ccjs_url_parts* out) {
  if (bytes == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  const char* colon = memchr(bytes, ':', len);

  if (colon == 0) {
    return CCJS_ERR_UNSUPPORTED;
  }

  size_t scheme_len = (size_t)(colon - bytes);

  if (scheme_len == 0 || scheme_len + 2 >= len || colon[1] != '/' || colon[2] != '/') {
    return CCJS_ERR_UNSUPPORTED;
  }

  const char* authority = colon + 3;
  const char* end = bytes + len;
  const char* cursor = authority;

  while (cursor < end && *cursor != '/' && *cursor != '?' && *cursor != '#') {
    cursor += 1;
  }

  const char* host_end = cursor;
  const char* port = host_end;

  for (const char* item = authority; item < host_end; item += 1) {
    if (*item == ':') {
      port = item;
      break;
    }
  }

  const char* path = cursor;
  size_t path_len = 1;
  const char* search = end;
  const char* hash = end;

  while (cursor < end && *cursor != '?' && *cursor != '#') {
    cursor += 1;
  }

  if (path < cursor) {
    path_len = (size_t)(cursor - path);
  } else {
    path = "/";
  }

  if (cursor < end && *cursor == '?') {
    search = cursor;

    while (cursor < end && *cursor != '#') {
      cursor += 1;
    }
  }

  if (cursor < end && *cursor == '#') {
    hash = cursor;
  }

  out->href.bytes = bytes;
  out->href.len = len;
  out->protocol.bytes = bytes;
  out->protocol.len = scheme_len + 1;
  out->hostname.bytes = authority;
  out->hostname.len = (size_t)(port - authority);
  out->port.bytes = port < host_end ? port + 1 : "";
  out->port.len = port < host_end ? (size_t)(host_end - port - 1) : 0;
  out->pathname.bytes = path;
  out->pathname.len = path_len;
  out->search.bytes = search < end ? search : "";
  out->search.len = search < end ? (size_t)((hash < end ? hash : end) - search) : 0;
  out->hash.bytes = hash < end ? hash : "";
  out->hash.len = hash < end ? (size_t)(end - hash) : 0;

  return CCJS_OK;
}

static int ccjs_url_is_absolute(const char* bytes, size_t len) {
  for (size_t index = 0; index < len; index += 1) {
    char value = bytes[index];

    if (value == ':') {
      return index > 0;
    }

    if (value == '/' || value == '?' || value == '#') {
      return 0;
    }
  }

  return 0;
}

static ccjs_status ccjs_url_object_from_parts(
  ccjs_allocator* allocator,
  const ccjs_shape* shape,
  const ccjs_url_parts* parts,
  ccjs_value* out
) {
  ccjs_value object = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, shape, &object);

  if (status == CCJS_OK) {
    status = ccjs_url_init_string_field(allocator, object, CCJS_URL_HREF_INDEX, parts->href.bytes, parts->href.len);
  }

  if (status == CCJS_OK) {
    status = ccjs_url_init_string_field(allocator, object, CCJS_URL_PROTOCOL_INDEX, parts->protocol.bytes, parts->protocol.len);
  }

  if (status == CCJS_OK) {
    status = ccjs_url_init_string_field(allocator, object, CCJS_URL_HOSTNAME_INDEX, parts->hostname.bytes, parts->hostname.len);
  }

  if (status == CCJS_OK) {
    status = ccjs_url_init_string_field(allocator, object, CCJS_URL_PORT_INDEX, parts->port.bytes, parts->port.len);
  }

  if (status == CCJS_OK) {
    status = ccjs_url_init_string_field(allocator, object, CCJS_URL_PATHNAME_INDEX, parts->pathname.bytes, parts->pathname.len);
  }

  if (status == CCJS_OK) {
    status = ccjs_url_init_string_field(allocator, object, CCJS_URL_SEARCH_INDEX, parts->search.bytes, parts->search.len);
  }

  if (status == CCJS_OK) {
    status = ccjs_url_init_string_field(allocator, object, CCJS_URL_HASH_INDEX, parts->hash.bytes, parts->hash.len);
  }

  if (status == CCJS_OK) {
    *out = object;
    return CCJS_OK;
  }

  ccjs_release(object);
  *out = ccjs_undefined_value();

  return status;
}

static ccjs_status ccjs_url_init_string_field(
  ccjs_allocator* allocator,
  ccjs_value object,
  uint32_t index,
  const char* bytes,
  size_t len
) {
  ccjs_value value = ccjs_undefined_value();
  ccjs_status status = ccjs_string_from_literal(allocator, bytes == 0 ? "" : bytes, len, &value);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, index, value);
  }

  ccjs_release(value);

  return status;
}

static ccjs_status ccjs_url_build_file_href(
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  char** out,
  size_t* out_len
) {
  char cwd[4096];
  const char* prefix = "file://";
  size_t prefix_len = 7;
  const char* base = path;
  size_t base_len = path_len;
  size_t cwd_len = 0;
  int needs_cwd = path_len == 0 || path[0] != '/';

  if (needs_cwd) {
    if (getcwd(cwd, sizeof(cwd)) == 0) {
      return CCJS_ERR_UNSUPPORTED;
    }

    cwd_len = strlen(cwd);
  }

  size_t escaped_len = 0;

  for (size_t index = 0; index < base_len; index += 1) {
    escaped_len += ccjs_url_should_escape_path_char((unsigned char)base[index]) ? 3 : 1;
  }

  size_t total = prefix_len + cwd_len + (needs_cwd ? 1 : 0) + escaped_len;
  char* href = ccjs_url_alloc(allocator, total);

  if (href == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;
  memcpy(href + offset, prefix, prefix_len);
  offset += prefix_len;

  if (needs_cwd) {
    memcpy(href + offset, cwd, cwd_len);
    offset += cwd_len;
    href[offset] = '/';
    offset += 1;
  }

  for (size_t index = 0; index < base_len; index += 1) {
    unsigned char value = (unsigned char)base[index];

    if (ccjs_url_should_escape_path_char(value)) {
      ccjs_url_write_hex(href + offset, value);
      offset += 3;
    } else {
      href[offset] = (char)value;
      offset += 1;
    }
  }

  *out = href;
  *out_len = offset;

  return CCJS_OK;
}

static ccjs_status ccjs_url_build_relative_href(
  ccjs_allocator* allocator,
  const char* input,
  size_t input_len,
  const ccjs_url_parts* base,
  char** out,
  size_t* out_len
) {
  const char* query = memchr(input, '?', input_len);
  const char* hash = memchr(input, '#', input_len);
  const char* suffix = query != 0 && (hash == 0 || query < hash) ? query : hash;
  size_t path_len = suffix == 0 ? input_len : (size_t)(suffix - input);
  size_t suffix_len = suffix == 0 ? 0 : input_len - path_len;
  size_t base_origin_len = base->protocol.len + 2 + base->hostname.len + (base->port.len == 0 ? 0 : 1 + base->port.len);
  size_t base_dir_len = 1;

  if (path_len == 0 || input[0] != '/') {
    base_dir_len = base->pathname.len;

    while (base_dir_len > 0 && base->pathname.bytes[base_dir_len - 1] != '/') {
      base_dir_len -= 1;
    }
  }

  size_t total = base_origin_len + (path_len != 0 && input[0] == '/' ? path_len : base_dir_len + path_len) + suffix_len;
  char* href = ccjs_url_alloc(allocator, total);

  if (href == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;
  memcpy(href + offset, base->protocol.bytes, base->protocol.len);
  offset += base->protocol.len;
  href[offset++] = '/';
  href[offset++] = '/';
  memcpy(href + offset, base->hostname.bytes, base->hostname.len);
  offset += base->hostname.len;

  if (base->port.len != 0) {
    href[offset++] = ':';
    memcpy(href + offset, base->port.bytes, base->port.len);
    offset += base->port.len;
  }

  if (path_len != 0 && input[0] == '/') {
    memcpy(href + offset, input, path_len);
    offset += path_len;
  } else {
    memcpy(href + offset, base->pathname.bytes, base_dir_len);
    offset += base_dir_len;
    memcpy(href + offset, input, path_len);
    offset += path_len;
  }

  if (suffix_len != 0) {
    memcpy(href + offset, suffix, suffix_len);
    offset += suffix_len;
  }

  *out = href;
  *out_len = offset;

  return CCJS_OK;
}

static ccjs_status ccjs_url_decode_file_path(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  char* decoded = ccjs_url_alloc(allocator, len);

  if (decoded == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < len; index += 1) {
    if (bytes[index] == '%' && index + 2 < len) {
      int high = ccjs_url_hex_value(bytes[index + 1]);
      int low = ccjs_url_hex_value(bytes[index + 2]);

      if (high >= 0 && low >= 0) {
        decoded[offset] = (char)((high << 4) | low);
        offset += 1;
        index += 2;
        continue;
      }
    }

    decoded[offset] = bytes[index];
    offset += 1;
  }

  *out = decoded;
  *out_len = offset;

  return CCJS_OK;
}

static ccjs_status ccjs_url_normalized_field_value(
  ccjs_allocator* allocator,
  uint32_t field_index,
  const char* bytes,
  size_t len,
  ccjs_value* out
) {
  char prefix = 0;

  if (field_index == CCJS_URL_PATHNAME_INDEX) {
    prefix = '/';
  } else if (field_index == CCJS_URL_SEARCH_INDEX) {
    prefix = '?';
  } else if (field_index == CCJS_URL_HASH_INDEX) {
    prefix = '#';
  }

  if (field_index == CCJS_URL_PATHNAME_INDEX && len == 0) {
    return ccjs_string_from_literal(allocator, "/", 1, out);
  }

  if (prefix == 0 || len == 0 || bytes[0] == prefix) {
    return ccjs_string_from_literal(allocator, bytes, len, out);
  }

  char* normalized = ccjs_url_alloc(allocator, len + 1);

  if (normalized == 0) {
    return CCJS_ERR_OOM;
  }

  normalized[0] = prefix;
  memcpy(normalized + 1, bytes, len);
  ccjs_status status = ccjs_string_from_literal(allocator, normalized, len + 1, out);
  allocator->free(allocator->user, normalized, len + 2, _Alignof(char));

  return status;
}

static ccjs_status ccjs_url_rebuild_href(ccjs_allocator* allocator, ccjs_value url) {
  enum { FIELD_COUNT = 6 };
  const uint32_t indexes[FIELD_COUNT] = {
    CCJS_URL_PROTOCOL_INDEX,
    CCJS_URL_HOSTNAME_INDEX,
    CCJS_URL_PORT_INDEX,
    CCJS_URL_PATHNAME_INDEX,
    CCJS_URL_SEARCH_INDEX,
    CCJS_URL_HASH_INDEX
  };
  ccjs_value values[FIELD_COUNT];
  const char* bytes[FIELD_COUNT];
  size_t lens[FIELD_COUNT];

  for (size_t index = 0; index < FIELD_COUNT; index += 1) {
    values[index] = ccjs_undefined_value();
    bytes[index] = 0;
    lens[index] = 0;
  }

  ccjs_status status = CCJS_OK;

  for (size_t index = 0; index < FIELD_COUNT; index += 1) {
    status = ccjs_url_value_string(url, indexes[index], &values[index], &bytes[index], &lens[index]);

    if (status != CCJS_OK) {
      for (size_t release_index = 0; release_index <= index; release_index += 1) {
        ccjs_release(values[release_index]);
      }

      return status;
    }
  }

  size_t total = lens[0] + 2 + lens[1] + (lens[2] == 0 ? 0 : 1 + lens[2]) + lens[3] + lens[4] + lens[5];
  char* href = ccjs_url_alloc(allocator, total);

  if (href == 0) {
    for (size_t index = 0; index < FIELD_COUNT; index += 1) {
      ccjs_release(values[index]);
    }

    return CCJS_ERR_OOM;
  }

  size_t offset = 0;
  memcpy(href + offset, bytes[0], lens[0]);
  offset += lens[0];
  href[offset++] = '/';
  href[offset++] = '/';
  memcpy(href + offset, bytes[1], lens[1]);
  offset += lens[1];

  if (lens[2] != 0) {
    href[offset++] = ':';
    memcpy(href + offset, bytes[2], lens[2]);
    offset += lens[2];
  }

  memcpy(href + offset, bytes[3], lens[3]);
  offset += lens[3];
  memcpy(href + offset, bytes[4], lens[4]);
  offset += lens[4];
  memcpy(href + offset, bytes[5], lens[5]);
  offset += lens[5];

  ccjs_value href_value = ccjs_undefined_value();
  status = ccjs_string_from_literal(allocator, href, offset, &href_value);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(url, CCJS_URL_HREF_INDEX, href_value);
  }

  ccjs_release(href_value);
  allocator->free(allocator->user, href, total + 1, _Alignof(char));

  for (size_t index = 0; index < FIELD_COUNT; index += 1) {
    ccjs_release(values[index]);
  }

  return status;
}

static ccjs_status ccjs_url_search_params_query(ccjs_value params, ccjs_value* retained, const char** bytes, size_t* len) {
  return ccjs_url_value_string(params, CCJS_URL_SEARCH_PARAMS_QUERY_INDEX, retained, bytes, len);
}

static ccjs_status ccjs_url_search_params_store_query(ccjs_allocator* allocator, ccjs_value params, const char* bytes, size_t len) {
  ccjs_value value = ccjs_undefined_value();
  ccjs_status status = ccjs_string_from_literal(allocator, bytes == 0 ? "" : bytes, len, &value);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(params, CCJS_URL_SEARCH_PARAMS_QUERY_INDEX, value);
  }

  ccjs_release(value);

  return status;
}

static ccjs_status ccjs_url_search_params_from_string(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  if (bytes == 0 || out == 0 || out_len == 0) {
    return CCJS_ERR_TYPE;
  }

  if (len != 0 && bytes[0] == '?') {
    bytes += 1;
    len -= 1;
  }

  char* query = ccjs_url_alloc(allocator, len);

  if (query == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(query, bytes, len);
  *out = query;
  *out_len = len;

  return CCJS_OK;
}

static ccjs_status ccjs_url_search_params_from_object(ccjs_allocator* allocator, ccjs_value init, char** out, size_t* out_len) {
  if (init.tag != CCJS_TAG_OBJECT || init.as.ref == 0 || out == 0 || out_len == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* object = (ccjs_object*)init.as.ref;
  char* query = ccjs_url_alloc(allocator, 0);

  if (query == 0) {
    return CCJS_ERR_OOM;
  }

  size_t query_len = 0;
  ccjs_status status = CCJS_OK;

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    ccjs_value value = ccjs_undefined_value();
    status = ccjs_object_get_known(init, index, &value);

    if (status != CCJS_OK) {
      break;
    }

    const char* value_bytes = 0;
    size_t value_len = 0;
    status = ccjs_url_string(value, &value_bytes, &value_len);

    if (status == CCJS_OK) {
      const char* key = object->shape->fields[index].name == 0 ? "" : object->shape->fields[index].name;
      status = ccjs_url_search_params_append_pair(allocator, &query, &query_len, key, strlen(key), value_bytes, value_len);
    }

    ccjs_release(value);

    if (status != CCJS_OK) {
      break;
    }
  }

  if (status != CCJS_OK) {
    allocator->free(allocator->user, query, query_len + 1, _Alignof(char));
    return status;
  }

  *out = query;
  *out_len = query_len;

  return CCJS_OK;
}

static ccjs_status ccjs_url_search_params_append_pair(
  ccjs_allocator* allocator,
  char** query,
  size_t* query_len,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
) {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  ccjs_status status = ccjs_url_encode_query_component(allocator, name, name_len, &encoded_name, &encoded_name_len);

  if (status != CCJS_OK) {
    return status;
  }

  char* encoded_value = 0;
  size_t encoded_value_len = 0;
  status = ccjs_url_encode_query_component(allocator, value, value_len, &encoded_value, &encoded_value_len);

  if (status != CCJS_OK) {
    allocator->free(allocator->user, encoded_name, encoded_name_len + 1, _Alignof(char));
    return status;
  }

  size_t old_len = *query_len;
  size_t separator_len = old_len == 0 ? 0 : 1;
  size_t next_len = old_len + separator_len + encoded_name_len + 1 + encoded_value_len;
  char* next = ccjs_url_alloc(allocator, next_len);

  if (next == 0) {
    allocator->free(allocator->user, encoded_name, encoded_name_len + 1, _Alignof(char));
    allocator->free(allocator->user, encoded_value, encoded_value_len + 1, _Alignof(char));
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;

  if (old_len != 0) {
    memcpy(next + offset, *query, old_len);
    offset += old_len;
    next[offset++] = '&';
  }

  memcpy(next + offset, encoded_name, encoded_name_len);
  offset += encoded_name_len;
  next[offset++] = '=';
  memcpy(next + offset, encoded_value, encoded_value_len);
  offset += encoded_value_len;

  if (*query != 0) {
    allocator->free(allocator->user, *query, *query_len + 1, _Alignof(char));
  }

  *query = next;
  *query_len = offset;

  allocator->free(allocator->user, encoded_name, encoded_name_len + 1, _Alignof(char));
  allocator->free(allocator->user, encoded_value, encoded_value_len + 1, _Alignof(char));

  return CCJS_OK;
}

static ccjs_status ccjs_url_search_params_remove_name(
  ccjs_allocator* allocator,
  const char* query,
  size_t query_len,
  const char* encoded_name,
  size_t encoded_name_len,
  char** out,
  size_t* out_len,
  int* removed
) {
  char* next = ccjs_url_alloc(allocator, 0);

  if (next == 0) {
    return CCJS_ERR_OOM;
  }

  size_t next_len = 0;
  int did_remove = 0;
  size_t cursor = 0;

  while (cursor < query_len) {
    size_t pair_start = cursor;

    while (cursor < query_len && query[cursor] != '&') {
      cursor += 1;
    }

    size_t pair_end = cursor;
    size_t key_end = pair_start;

    while (key_end < pair_end && query[key_end] != '=') {
      key_end += 1;
    }

    size_t key_len = key_end - pair_start;
    int matches = key_len == encoded_name_len && strncmp(query + pair_start, encoded_name, encoded_name_len) == 0;

    if (matches) {
      did_remove = 1;
    } else {
      size_t segment_len = pair_end - pair_start;
      size_t separator_len = next_len == 0 ? 0 : 1;
      size_t combined_len = next_len + separator_len + segment_len;
      char* combined = ccjs_url_alloc(allocator, combined_len);

      if (combined == 0) {
        allocator->free(allocator->user, next, next_len + 1, _Alignof(char));
        return CCJS_ERR_OOM;
      }

      size_t offset = 0;

      if (next_len != 0) {
        memcpy(combined + offset, next, next_len);
        offset += next_len;
        combined[offset++] = '&';
      }

      memcpy(combined + offset, query + pair_start, segment_len);
      offset += segment_len;
      allocator->free(allocator->user, next, next_len + 1, _Alignof(char));
      next = combined;
      next_len = offset;
    }

    if (cursor < query_len && query[cursor] == '&') {
      cursor += 1;
    }
  }

  *out = next;
  *out_len = next_len;

  if (removed != 0) {
    *removed = did_remove;
  }

  return CCJS_OK;
}

static int ccjs_url_search_params_has_encoded_name(
  const char* query,
  size_t query_len,
  const char* encoded_name,
  size_t encoded_name_len,
  const char** value,
  size_t* value_len
) {
  size_t cursor = 0;

  while (cursor < query_len) {
    size_t pair_start = cursor;

    while (cursor < query_len && query[cursor] != '&') {
      cursor += 1;
    }

    size_t pair_end = cursor;
    size_t key_end = pair_start;

    while (key_end < pair_end && query[key_end] != '=') {
      key_end += 1;
    }

    size_t key_len = key_end - pair_start;

    if (key_len == encoded_name_len && strncmp(query + pair_start, encoded_name, encoded_name_len) == 0) {
      if (value != 0) {
        *value = key_end < pair_end ? query + key_end + 1 : "";
      }

      if (value_len != 0) {
        *value_len = key_end < pair_end ? pair_end - key_end - 1 : 0;
      }

      return 1;
    }

    if (cursor < query_len && query[cursor] == '&') {
      cursor += 1;
    }
  }

  return 0;
}

static ccjs_status ccjs_url_encode_query_component(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  size_t encoded_len = 0;

  for (size_t index = 0; index < len; index += 1) {
    unsigned char value = (unsigned char)bytes[index];
    encoded_len += value == ' ' ? 1 : ccjs_url_should_escape_query_char(value) ? 3 : 1;
  }

  char* encoded = ccjs_url_alloc(allocator, encoded_len);

  if (encoded == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < len; index += 1) {
    unsigned char value = (unsigned char)bytes[index];

    if (value == ' ') {
      encoded[offset++] = '+';
    } else if (ccjs_url_should_escape_query_char(value)) {
      ccjs_url_write_hex(encoded + offset, value);
      offset += 3;
    } else {
      encoded[offset++] = (char)value;
    }
  }

  *out = encoded;
  *out_len = offset;

  return CCJS_OK;
}

static ccjs_status ccjs_url_decode_query_component(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  char* decoded = ccjs_url_alloc(allocator, len);

  if (decoded == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < len; index += 1) {
    if (bytes[index] == '+') {
      decoded[offset++] = ' ';
      continue;
    }

    if (bytes[index] == '%' && index + 2 < len) {
      int high = ccjs_url_hex_value(bytes[index + 1]);
      int low = ccjs_url_hex_value(bytes[index + 2]);

      if (high >= 0 && low >= 0) {
        decoded[offset++] = (char)((high << 4) | low);
        index += 2;
        continue;
      }
    }

    decoded[offset++] = bytes[index];
  }

  *out = decoded;
  *out_len = offset;

  return CCJS_OK;
}

static char* ccjs_url_alloc(ccjs_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  char* bytes = allocator->alloc(allocator->user, len + 1, _Alignof(char));

  if (bytes != 0) {
    bytes[len] = 0;
  }

  return bytes;
}

static int ccjs_url_hex_value(char value) {
  if (value >= '0' && value <= '9') {
    return value - '0';
  }

  if (value >= 'a' && value <= 'f') {
    return value - 'a' + 10;
  }

  if (value >= 'A' && value <= 'F') {
    return value - 'A' + 10;
  }

  return -1;
}

static int ccjs_url_should_escape_path_char(unsigned char value) {
  return !(isalnum(value) || value == '/' || value == '.' || value == '-' || value == '_' || value == '~');
}

static int ccjs_url_should_escape_query_char(unsigned char value) {
  return !(isalnum(value) || value == '*' || value == '-' || value == '.' || value == '_');
}

static void ccjs_url_write_hex(char* out, unsigned char value) {
  static const char* digits = "0123456789ABCDEF";

  out[0] = '%';
  out[1] = digits[(value >> 4) & 0x0f];
  out[2] = digits[value & 0x0f];
}
