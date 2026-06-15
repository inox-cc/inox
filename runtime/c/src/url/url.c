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
static char* ccjs_url_alloc(ccjs_allocator* allocator, size_t len);
static int ccjs_url_hex_value(char value);
static int ccjs_url_should_escape_path_char(unsigned char value);
static void ccjs_url_write_hex(char* out, unsigned char value);

ccjs_status ccjs_url_file_url_to_path(ccjs_allocator* allocator, ccjs_value url, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_url_string(url, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  if (len < 7 || strncmp(bytes, "file://", 7) != 0) {
    return CCJS_ERR_UNSUPPORTED;
  }

  const char* path = bytes + 7;
  size_t path_len = len - 7;
  size_t host_len = 0;

  while (host_len < path_len && path[host_len] != '/') {
    host_len += 1;
  }

  if (host_len != 0 && !(host_len == 9 && strncmp(path, "localhost", 9) == 0)) {
    return CCJS_ERR_UNSUPPORTED;
  }

  path += host_len;
  path_len -= host_len;

  if (path_len == 0 || path[0] != '/') {
    return CCJS_ERR_UNSUPPORTED;
  }

  char* decoded = 0;
  size_t decoded_len = 0;

  status = ccjs_url_decode_file_path(allocator, path, path_len, &decoded, &decoded_len);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_string_from_literal(allocator, decoded, decoded_len, out);
  allocator->free(allocator->user, decoded, decoded_len + 1, _Alignof(char));

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
  ccjs_url_parts base_parts;

  status = ccjs_url_string(base, &base_bytes, &base_len);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_url_parse(base_bytes, base_len, &base_parts);

  if (status != CCJS_OK) {
    return status;
  }

  char* href = 0;
  size_t href_len = 0;

  status = ccjs_url_build_relative_href(allocator, input_bytes, input_len, &base_parts, &href, &href_len);

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

static ccjs_status ccjs_url_string(ccjs_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != CCJS_TAG_STRING || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_string* string = (ccjs_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return CCJS_OK;
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

static void ccjs_url_write_hex(char* out, unsigned char value) {
  static const char* digits = "0123456789ABCDEF";

  out[0] = '%';
  out[1] = digits[(value >> 4) & 0x0f];
  out[2] = digits[value & 0x0f];
}
