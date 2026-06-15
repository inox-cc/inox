#include "ccjs/path.h"

#include <string.h>
#include <unistd.h>
#include "ccjs/string.h"

typedef struct ccjs_path_span {
  const char* bytes;
  size_t len;
} ccjs_path_span;

static ccjs_status ccjs_path_string(ccjs_value value, const char** bytes, size_t* len);
static ccjs_status ccjs_path_string_result(ccjs_allocator* allocator, char* bytes, size_t len, ccjs_value* out);
static char* ccjs_path_alloc(ccjs_allocator* allocator, size_t len);
static ccjs_status ccjs_path_copy(ccjs_allocator* allocator, const char* bytes, size_t len, char** out, size_t* out_len);
static ccjs_status ccjs_path_normalize_bytes(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static ccjs_status ccjs_path_concat_values(
  ccjs_allocator* allocator,
  const ccjs_value* paths,
  size_t path_count,
  char** out,
  size_t* out_len
);
static size_t ccjs_path_trim_trailing_slashes(const char* bytes, size_t len);
static int ccjs_path_ends_with(const char* bytes, size_t len, const char* suffix, size_t suffix_len);

ccjs_status ccjs_path_basename(ccjs_allocator* allocator, ccjs_value path, ccjs_value suffix, int has_suffix, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_path_string(path, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  const char* suffix_bytes = 0;
  size_t suffix_len = 0;

  if (has_suffix) {
    status = ccjs_path_string(suffix, &suffix_bytes, &suffix_len);

    if (status != CCJS_OK) {
      return status;
    }
  }

  len = ccjs_path_trim_trailing_slashes(bytes, len);

  if (len == 0) {
    return ccjs_string_from_literal(allocator, "", 0, out);
  }

  size_t start = len;

  while (start > 0 && bytes[start - 1] != '/') {
    start -= 1;
  }

  const char* base = bytes + start;
  size_t base_len = len - start;

  if (has_suffix && suffix_len > 0 && suffix_len < base_len && ccjs_path_ends_with(base, base_len, suffix_bytes, suffix_len)) {
    base_len -= suffix_len;
  }

  return ccjs_string_from_literal(allocator, base, base_len, out);
}

ccjs_status ccjs_path_dirname(ccjs_allocator* allocator, ccjs_value path, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_path_string(path, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  len = ccjs_path_trim_trailing_slashes(bytes, len);

  if (len == 0) {
    return ccjs_string_from_literal(allocator, ".", 1, out);
  }

  size_t slash = len;

  while (slash > 0 && bytes[slash - 1] != '/') {
    slash -= 1;
  }

  if (slash == 0) {
    return ccjs_string_from_literal(allocator, ".", 1, out);
  }

  while (slash > 1 && bytes[slash - 1] == '/') {
    slash -= 1;
  }

  return ccjs_string_from_literal(allocator, bytes, slash, out);
}

ccjs_status ccjs_path_extname(ccjs_allocator* allocator, ccjs_value path, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_path_string(path, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  len = ccjs_path_trim_trailing_slashes(bytes, len);
  size_t start = len;

  while (start > 0 && bytes[start - 1] != '/') {
    start -= 1;
  }

  size_t first_non_dot = len;

  for (size_t index = start; index < len; index += 1) {
    if (bytes[index] != '.') {
      first_non_dot = index;
      break;
    }
  }

  size_t dot = len;

  while (dot > start && bytes[dot - 1] != '.') {
    dot -= 1;
  }

  if (dot == start || dot == start + 1 || dot == len || first_non_dot == len) {
    return ccjs_string_from_literal(allocator, "", 0, out);
  }

  return ccjs_string_from_literal(allocator, bytes + dot - 1, len - dot + 1, out);
}

ccjs_status ccjs_path_is_absolute(ccjs_value path, int* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_path_string(path, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = len > 0 && bytes[0] == '/';

  return CCJS_OK;
}

ccjs_status ccjs_path_join(ccjs_allocator* allocator, const ccjs_value* paths, size_t path_count, ccjs_value* out) {
  char* joined = 0;
  size_t joined_len = 0;
  ccjs_status status = ccjs_path_concat_values(allocator, paths, path_count, &joined, &joined_len);

  if (status != CCJS_OK) {
    return status;
  }

  char* normalized = 0;
  size_t normalized_len = 0;

  status = ccjs_path_normalize_bytes(allocator, joined, joined_len, &normalized, &normalized_len);
  allocator->free(allocator->user, joined, joined_len + 1, _Alignof(char));

  return status == CCJS_OK ? ccjs_path_string_result(allocator, normalized, normalized_len, out) : status;
}

ccjs_status ccjs_path_normalize(ccjs_allocator* allocator, ccjs_value path, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_path_string(path, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  char* normalized = 0;
  size_t normalized_len = 0;

  status = ccjs_path_normalize_bytes(allocator, bytes, len, &normalized, &normalized_len);

  return status == CCJS_OK ? ccjs_path_string_result(allocator, normalized, normalized_len, out) : status;
}

ccjs_status ccjs_path_relative(ccjs_allocator* allocator, ccjs_value from, ccjs_value to, ccjs_value* out) {
  ccjs_value values[1];
  const char* from_resolved = 0;
  const char* to_resolved = 0;
  size_t from_len = 0;
  size_t to_len = 0;

  values[0] = from;
  ccjs_status status = ccjs_path_resolve(allocator, values, 1, &from);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_path_string(from, &from_resolved, &from_len);

  if (status != CCJS_OK) {
    ccjs_release(from);
    return status;
  }

  values[0] = to;
  status = ccjs_path_resolve(allocator, values, 1, &to);

  if (status != CCJS_OK) {
    ccjs_release(from);
    return status;
  }

  status = ccjs_path_string(to, &to_resolved, &to_len);

  if (status != CCJS_OK) {
    ccjs_release(from);
    ccjs_release(to);
    return status;
  }

  if (from_len == to_len && memcmp(from_resolved, to_resolved, from_len) == 0) {
    ccjs_release(from);
    ccjs_release(to);
    return ccjs_string_from_literal(allocator, "", 0, out);
  }

  size_t from_index = 1;
  size_t to_index = 1;

  while (from_index < from_len && to_index < to_len) {
    size_t from_next = from_index;
    size_t to_next = to_index;

    while (from_next < from_len && from_resolved[from_next] != '/') {
      from_next += 1;
    }

    while (to_next < to_len && to_resolved[to_next] != '/') {
      to_next += 1;
    }

    if (from_next - from_index != to_next - to_index ||
        memcmp(from_resolved + from_index, to_resolved + to_index, from_next - from_index) != 0) {
      break;
    }

    from_index = from_next < from_len ? from_next + 1 : from_next;
    to_index = to_next < to_len ? to_next + 1 : to_next;
  }

  size_t up_count = 0;

  for (size_t index = from_index; index < from_len;) {
    while (index < from_len && from_resolved[index] == '/') {
      index += 1;
    }

    if (index >= from_len) {
      break;
    }

    up_count += 1;

    while (index < from_len && from_resolved[index] != '/') {
      index += 1;
    }
  }

  size_t down_len = to_index < to_len ? to_len - to_index : 0;
  size_t up_len = up_count == 0 ? 0 : up_count * 2 + up_count - 1;
  size_t out_len = up_len + (up_len > 0 && down_len > 0 ? 1 : 0) + down_len;
  char* result = ccjs_path_alloc(allocator, out_len);

  if (result == 0) {
    ccjs_release(from);
    ccjs_release(to);
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < up_count; index += 1) {
    if (offset != 0) {
      result[offset] = '/';
      offset += 1;
    }

    result[offset] = '.';
    result[offset + 1] = '.';
    offset += 2;
  }

  if (down_len > 0) {
    if (offset != 0) {
      result[offset] = '/';
      offset += 1;
    }

    memcpy(result + offset, to_resolved + to_index, down_len);
    offset += down_len;
  }

  ccjs_release(from);
  ccjs_release(to);

  return ccjs_path_string_result(allocator, result, offset, out);
}

ccjs_status ccjs_path_resolve(ccjs_allocator* allocator, const ccjs_value* paths, size_t path_count, ccjs_value* out) {
  const char* start_bytes = 0;
  size_t start_len = 0;
  size_t start_index = 0;
  int found_absolute = 0;

  for (size_t index = path_count; index > 0; index -= 1) {
    const char* bytes = 0;
    size_t len = 0;
    ccjs_status status = ccjs_path_string(paths[index - 1], &bytes, &len);

    if (status != CCJS_OK) {
      return status;
    }

    if (len > 0 && bytes[0] == '/') {
      start_bytes = bytes;
      start_len = len;
      start_index = index - 1;
      found_absolute = 1;
      break;
    }
  }

  char cwd[4096];

  if (!found_absolute) {
    if (getcwd(cwd, sizeof(cwd)) == 0) {
      return CCJS_ERR_UNSUPPORTED;
    }

    start_bytes = cwd;
    start_len = strlen(cwd);
    start_index = 0;
  }

  size_t total = start_len;

  for (size_t index = start_index + (found_absolute ? 1 : 0); index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    ccjs_status status = ccjs_path_string(paths[index], &bytes, &len);

    if (status != CCJS_OK) {
      return status;
    }

    if (len != 0) {
      total += 1 + len;
    }
  }

  char* joined = ccjs_path_alloc(allocator, total);

  if (joined == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;
  memcpy(joined, start_bytes, start_len);
  offset = start_len;

  for (size_t index = start_index + (found_absolute ? 1 : 0); index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    ccjs_status status = ccjs_path_string(paths[index], &bytes, &len);

    if (status != CCJS_OK) {
      allocator->free(allocator->user, joined, total + 1, _Alignof(char));
      return status;
    }

    if (len == 0) {
      continue;
    }

    joined[offset] = '/';
    offset += 1;
    memcpy(joined + offset, bytes, len);
    offset += len;
  }

  char* normalized = 0;
  size_t normalized_len = 0;
  ccjs_status status = ccjs_path_normalize_bytes(allocator, joined, offset, &normalized, &normalized_len);
  allocator->free(allocator->user, joined, total + 1, _Alignof(char));

  return status == CCJS_OK ? ccjs_path_string_result(allocator, normalized, normalized_len, out) : status;
}

static ccjs_status ccjs_path_string(ccjs_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != CCJS_TAG_STRING || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_string* string = (ccjs_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return CCJS_OK;
}

static ccjs_status ccjs_path_string_result(ccjs_allocator* allocator, char* bytes, size_t len, ccjs_value* out) {
  if (bytes == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status status = ccjs_string_from_literal(allocator, bytes, len, out);
  allocator->free(allocator->user, bytes, len + 1, _Alignof(char));

  return status;
}

static char* ccjs_path_alloc(ccjs_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  char* bytes = allocator->alloc(allocator->user, len + 1, _Alignof(char));

  if (bytes != 0) {
    bytes[len] = 0;
  }

  return bytes;
}

static ccjs_status ccjs_path_copy(ccjs_allocator* allocator, const char* bytes, size_t len, char** out, size_t* out_len) {
  char* copy = ccjs_path_alloc(allocator, len);

  if (copy == 0) {
    return CCJS_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  *out = copy;
  *out_len = len;

  return CCJS_OK;
}

static ccjs_status ccjs_path_normalize_bytes(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  if (bytes == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (len == 0) {
    return ccjs_path_copy(allocator, ".", 1, out, out_len);
  }

  ccjs_path_span* segments = allocator->alloc(allocator->user, sizeof(ccjs_path_span) * (len + 1), _Alignof(ccjs_path_span));

  if (segments == 0) {
    return CCJS_ERR_OOM;
  }

  const int absolute = bytes[0] == '/';
  size_t count = 0;
  size_t index = 0;

  while (index < len) {
    while (index < len && bytes[index] == '/') {
      index += 1;
    }

    size_t start = index;

    while (index < len && bytes[index] != '/') {
      index += 1;
    }

    size_t segment_len = index - start;

    if (segment_len == 0 || (segment_len == 1 && bytes[start] == '.')) {
      continue;
    }

    if (segment_len == 2 && bytes[start] == '.' && bytes[start + 1] == '.') {
      if (count > 0 && !(segments[count - 1].len == 2 && segments[count - 1].bytes[0] == '.' && segments[count - 1].bytes[1] == '.')) {
        count -= 1;
      } else if (!absolute) {
        segments[count].bytes = bytes + start;
        segments[count].len = segment_len;
        count += 1;
      }
      continue;
    }

    segments[count].bytes = bytes + start;
    segments[count].len = segment_len;
    count += 1;
  }

  if (count == 0) {
    allocator->free(allocator->user, segments, sizeof(ccjs_path_span) * (len + 1), _Alignof(ccjs_path_span));
    return absolute ? ccjs_path_copy(allocator, "/", 1, out, out_len) : ccjs_path_copy(allocator, ".", 1, out, out_len);
  }

  size_t result_len = absolute ? 1 : 0;

  for (size_t i = 0; i < count; i += 1) {
    result_len += segments[i].len + (i == 0 ? 0 : 1);
  }

  char* result = ccjs_path_alloc(allocator, result_len);

  if (result == 0) {
    allocator->free(allocator->user, segments, sizeof(ccjs_path_span) * (len + 1), _Alignof(ccjs_path_span));
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;

  if (absolute) {
    result[offset] = '/';
    offset += 1;
  }

  for (size_t i = 0; i < count; i += 1) {
    if (i != 0) {
      result[offset] = '/';
      offset += 1;
    }

    memcpy(result + offset, segments[i].bytes, segments[i].len);
    offset += segments[i].len;
  }

  allocator->free(allocator->user, segments, sizeof(ccjs_path_span) * (len + 1), _Alignof(ccjs_path_span));
  *out = result;
  *out_len = offset;

  return CCJS_OK;
}

static ccjs_status ccjs_path_concat_values(
  ccjs_allocator* allocator,
  const ccjs_value* paths,
  size_t path_count,
  char** out,
  size_t* out_len
) {
  size_t total = 0;
  size_t non_empty = 0;

  for (size_t index = 0; index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    ccjs_status status = ccjs_path_string(paths[index], &bytes, &len);

    if (status != CCJS_OK) {
      return status;
    }

    if (len != 0) {
      total += len + (non_empty == 0 ? 0 : 1);
      non_empty += 1;
    }
  }

  if (non_empty == 0) {
    return ccjs_path_copy(allocator, ".", 1, out, out_len);
  }

  char* joined = ccjs_path_alloc(allocator, total);

  if (joined == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;
  size_t emitted = 0;

  for (size_t index = 0; index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    ccjs_status status = ccjs_path_string(paths[index], &bytes, &len);

    if (status != CCJS_OK) {
      allocator->free(allocator->user, joined, total + 1, _Alignof(char));
      return status;
    }

    if (len == 0) {
      continue;
    }

    if (emitted != 0) {
      joined[offset] = '/';
      offset += 1;
    }

    memcpy(joined + offset, bytes, len);
    offset += len;
    emitted += 1;
  }

  *out = joined;
  *out_len = offset;

  return CCJS_OK;
}

static size_t ccjs_path_trim_trailing_slashes(const char* bytes, size_t len) {
  while (len > 1 && bytes[len - 1] == '/') {
    len -= 1;
  }

  return len;
}

static int ccjs_path_ends_with(const char* bytes, size_t len, const char* suffix, size_t suffix_len) {
  return suffix_len <= len && memcmp(bytes + len - suffix_len, suffix, suffix_len) == 0;
}
