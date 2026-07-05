#include "inox/path.h"

#include <string.h>
#include <unistd.h>
#include "inox/object.h"
#include "inox/string.h"

typedef struct inox_path_span {
  const char* bytes;
  size_t len;
} inox_path_span;

static inox_status inox_path_string(inox_value value, const char** bytes, size_t* len);
static inox_status inox_path_string_result(inox_allocator* allocator, char* bytes, size_t len, inox_value* out);
static char* inox_path_alloc(inox_allocator* allocator, size_t len);
static inox_status inox_path_copy(inox_allocator* allocator, const char* bytes, size_t len, char** out, size_t* out_len);
static inox_status inox_path_normalize_bytes(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static inox_status inox_path_concat_values(
  inox_allocator* allocator,
  const inox_value* paths,
  size_t path_count,
  char** out,
  size_t* out_len
);
static size_t inox_path_trim_trailing_slashes(const char* bytes, size_t len);
static size_t inox_path_ext_offset(const char* bytes, size_t start, size_t len);
static int inox_path_ends_with(const char* bytes, size_t len, const char* suffix, size_t suffix_len);
static inox_status inox_path_object_string(
  inox_value object,
  const char* name,
  const char** bytes,
  size_t* len,
  int* present,
  inox_value* value
);

inox_status inox_path_basename(inox_allocator* allocator, inox_value path, inox_value suffix, int has_suffix, inox_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_path_string(path, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  const char* suffix_bytes = 0;
  size_t suffix_len = 0;

  if (has_suffix) {
    status = inox_path_string(suffix, &suffix_bytes, &suffix_len);

    if (status != INOX_OK) {
      return status;
    }
  }

  len = inox_path_trim_trailing_slashes(bytes, len);

  if (len == 0) {
    return inox_string_from_literal(allocator, "", 0, out);
  }

  size_t start = len;

  while (start > 0 && bytes[start - 1] != '/') {
    start -= 1;
  }

  const char* base = bytes + start;
  size_t base_len = len - start;

  if (has_suffix && suffix_len > 0 && suffix_len < base_len && inox_path_ends_with(base, base_len, suffix_bytes, suffix_len)) {
    base_len -= suffix_len;
  }

  return inox_string_from_literal(allocator, base, base_len, out);
}

inox_status inox_path_dirname(inox_allocator* allocator, inox_value path, inox_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_path_string(path, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  len = inox_path_trim_trailing_slashes(bytes, len);

  if (len == 0) {
    return inox_string_from_literal(allocator, ".", 1, out);
  }

  size_t slash = len;

  while (slash > 0 && bytes[slash - 1] != '/') {
    slash -= 1;
  }

  if (slash == 0) {
    return inox_string_from_literal(allocator, ".", 1, out);
  }

  while (slash > 1 && bytes[slash - 1] == '/') {
    slash -= 1;
  }

  return inox_string_from_literal(allocator, bytes, slash, out);
}

inox_status inox_path_extname(inox_allocator* allocator, inox_value path, inox_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_path_string(path, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  len = inox_path_trim_trailing_slashes(bytes, len);
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
    return inox_string_from_literal(allocator, "", 0, out);
  }

  return inox_string_from_literal(allocator, bytes + dot - 1, len - dot + 1, out);
}

inox_status inox_path_is_absolute(inox_value path, int* out) {
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_path_string(path, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = len > 0 && bytes[0] == '/';

  return INOX_OK;
}

inox_status inox_path_join(inox_allocator* allocator, const inox_value* paths, size_t path_count, inox_value* out) {
  char* joined = 0;
  size_t joined_len = 0;
  inox_status status = inox_path_concat_values(allocator, paths, path_count, &joined, &joined_len);

  if (status != INOX_OK) {
    return status;
  }

  char* normalized = 0;
  size_t normalized_len = 0;

  status = inox_path_normalize_bytes(allocator, joined, joined_len, &normalized, &normalized_len);
  allocator->free(allocator->user, joined, joined_len + 1, alignof(char));

  return status == INOX_OK ? inox_path_string_result(allocator, normalized, normalized_len, out) : status;
}

inox_status inox_path_format(inox_allocator* allocator, inox_value path_object, inox_value* out) {
  const char* dir = "";
  const char* root = "";
  const char* base = "";
  const char* name = "";
  const char* ext = "";
  size_t dir_len = 0;
  size_t root_len = 0;
  size_t base_len = 0;
  size_t name_len = 0;
  size_t ext_len = 0;
  int dir_present = 0;
  int root_present = 0;
  int base_present = 0;
  int name_present = 0;
  int ext_present = 0;
  inox_value dir_value = inox_undefined_value();
  inox_value root_value = inox_undefined_value();
  inox_value base_value = inox_undefined_value();
  inox_value name_value = inox_undefined_value();
  inox_value ext_value = inox_undefined_value();
  inox_status status = inox_path_object_string(path_object, "dir", &dir, &dir_len, &dir_present, &dir_value);

  if (status == INOX_OK) {
    status = inox_path_object_string(path_object, "root", &root, &root_len, &root_present, &root_value);
  }

  if (status == INOX_OK) {
    status = inox_path_object_string(path_object, "base", &base, &base_len, &base_present, &base_value);
  }

  if (status == INOX_OK) {
    status = inox_path_object_string(path_object, "name", &name, &name_len, &name_present, &name_value);
  }

  if (status == INOX_OK) {
    status = inox_path_object_string(path_object, "ext", &ext, &ext_len, &ext_present, &ext_value);
  }

  if (status != INOX_OK) {
    inox_release(dir_value);
    inox_release(root_value);
    inox_release(base_value);
    inox_release(name_value);
    inox_release(ext_value);
    return status;
  }

  const char* file = base_present && base_len > 0 ? base : name;
  size_t file_len = base_present && base_len > 0 ? base_len : name_len;
  const int use_ext = !(base_present && base_len > 0) && ext_present && ext_len > 0;
  const int needs_dot = use_ext && ext[0] != '.';
  const char* parent = dir_present && dir_len > 0 ? dir : root;
  size_t parent_len = dir_present && dir_len > 0 ? dir_len : root_len;
  const int needs_slash = parent_len > 0 && file_len + (use_ext ? ext_len + (needs_dot ? 1 : 0) : 0) > 0 && parent[parent_len - 1] != '/';
  const size_t out_len = parent_len + (needs_slash ? 1 : 0) + file_len + (use_ext ? ext_len + (needs_dot ? 1 : 0) : 0);
  char* result = inox_path_alloc(allocator, out_len);

  if (result == 0) {
    inox_release(dir_value);
    inox_release(root_value);
    inox_release(base_value);
    inox_release(name_value);
    inox_release(ext_value);
    return INOX_ERR_OOM;
  }

  size_t offset = 0;

  if (parent_len > 0) {
    memcpy(result + offset, parent, parent_len);
    offset += parent_len;
  }

  if (needs_slash) {
    result[offset] = '/';
    offset += 1;
  }

  if (file_len > 0) {
    memcpy(result + offset, file, file_len);
    offset += file_len;
  }

  if (use_ext) {
    if (needs_dot) {
      result[offset] = '.';
      offset += 1;
    }

    memcpy(result + offset, ext, ext_len);
    offset += ext_len;
  }

  inox_release(dir_value);
  inox_release(root_value);
  inox_release(base_value);
  inox_release(name_value);
  inox_release(ext_value);

  return inox_path_string_result(allocator, result, offset, out);
}

inox_status inox_path_normalize(inox_allocator* allocator, inox_value path, inox_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_path_string(path, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  char* normalized = 0;
  size_t normalized_len = 0;

  status = inox_path_normalize_bytes(allocator, bytes, len, &normalized, &normalized_len);

  return status == INOX_OK ? inox_path_string_result(allocator, normalized, normalized_len, out) : status;
}

inox_status inox_path_parse(inox_allocator* allocator, inox_value path, const inox_shape* shape, inox_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_path_string(path, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  if (shape == 0) {
    return INOX_ERR_TYPE;
  }

  status = inox_object_new(allocator, shape, out);

  if (status != INOX_OK) {
    return status;
  }

  size_t trimmed_len = inox_path_trim_trailing_slashes(bytes, len);

  if (trimmed_len == 0) {
    trimmed_len = len > 0 && bytes[0] == '/' ? 1 : 0;
  }

  const int absolute = trimmed_len > 0 && bytes[0] == '/';
  size_t base_start = 0;
  size_t slash = trimmed_len;

  while (slash > 0 && bytes[slash - 1] != '/') {
    slash -= 1;
  }

  if (slash > 0) {
    base_start = slash;
  }

  size_t dir_len = 0;

  if (slash > 0) {
    dir_len = slash == 1 && absolute ? 1 : slash - 1;
  }

  const char* base = bytes + base_start;
  const size_t base_len = trimmed_len > base_start ? trimmed_len - base_start : 0;
  const size_t ext_offset = inox_path_ext_offset(bytes, base_start, trimmed_len);
  const size_t ext_len = ext_offset < trimmed_len ? trimmed_len - ext_offset : 0;
  const size_t name_len = ext_len > 0 ? ext_offset - base_start : base_len;
  inox_value root_value = inox_undefined_value();
  inox_value dir_value = inox_undefined_value();
  inox_value base_value = inox_undefined_value();
  inox_value ext_value = inox_undefined_value();
  inox_value name_value = inox_undefined_value();

  status = inox_string_from_literal(allocator, absolute ? "/" : "", absolute ? 1 : 0, &root_value);

  if (status == INOX_OK) {
    status = inox_string_from_literal(allocator, bytes, dir_len, &dir_value);
  }

  if (status == INOX_OK) {
    status = inox_string_from_literal(allocator, base, base_len, &base_value);
  }

  if (status == INOX_OK) {
    status = inox_string_from_literal(allocator, ext_len > 0 ? bytes + ext_offset : "", ext_len, &ext_value);
  }

  if (status == INOX_OK) {
    status = inox_string_from_literal(allocator, base, name_len, &name_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(*out, 0, root_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(*out, 1, dir_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(*out, 2, base_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(*out, 3, ext_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(*out, 4, name_value);
  }

  inox_release(root_value);
  inox_release(dir_value);
  inox_release(base_value);
  inox_release(ext_value);
  inox_release(name_value);

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();
  }

  return status;
}

inox_status inox_path_relative(inox_allocator* allocator, inox_value from, inox_value to, inox_value* out) {
  inox_value values[1];
  const char* from_resolved = 0;
  const char* to_resolved = 0;
  size_t from_len = 0;
  size_t to_len = 0;

  values[0] = from;
  inox_status status = inox_path_resolve(allocator, values, 1, &from);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_path_string(from, &from_resolved, &from_len);

  if (status != INOX_OK) {
    inox_release(from);
    return status;
  }

  values[0] = to;
  status = inox_path_resolve(allocator, values, 1, &to);

  if (status != INOX_OK) {
    inox_release(from);
    return status;
  }

  status = inox_path_string(to, &to_resolved, &to_len);

  if (status != INOX_OK) {
    inox_release(from);
    inox_release(to);
    return status;
  }

  if (from_len == to_len && memcmp(from_resolved, to_resolved, from_len) == 0) {
    inox_release(from);
    inox_release(to);
    return inox_string_from_literal(allocator, "", 0, out);
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
  char* result = inox_path_alloc(allocator, out_len);

  if (result == 0) {
    inox_release(from);
    inox_release(to);
    return INOX_ERR_OOM;
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

  inox_release(from);
  inox_release(to);

  return inox_path_string_result(allocator, result, offset, out);
}

inox_status inox_path_resolve(inox_allocator* allocator, const inox_value* paths, size_t path_count, inox_value* out) {
  const char* start_bytes = 0;
  size_t start_len = 0;
  size_t start_index = 0;
  int found_absolute = 0;

  for (size_t index = path_count; index > 0; index -= 1) {
    const char* bytes = 0;
    size_t len = 0;
    inox_status status = inox_path_string(paths[index - 1], &bytes, &len);

    if (status != INOX_OK) {
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
      return INOX_ERR_UNSUPPORTED;
    }

    start_bytes = cwd;
    start_len = strlen(cwd);
    start_index = 0;
  }

  size_t total = start_len;

  for (size_t index = start_index + (found_absolute ? 1 : 0); index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    inox_status status = inox_path_string(paths[index], &bytes, &len);

    if (status != INOX_OK) {
      return status;
    }

    if (len != 0) {
      total += 1 + len;
    }
  }

  char* joined = inox_path_alloc(allocator, total);

  if (joined == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;
  memcpy(joined, start_bytes, start_len);
  offset = start_len;

  for (size_t index = start_index + (found_absolute ? 1 : 0); index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    inox_status status = inox_path_string(paths[index], &bytes, &len);

    if (status != INOX_OK) {
      allocator->free(allocator->user, joined, total + 1, alignof(char));
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
  inox_status status = inox_path_normalize_bytes(allocator, joined, offset, &normalized, &normalized_len);
  allocator->free(allocator->user, joined, total + 1, alignof(char));

  return status == INOX_OK ? inox_path_string_result(allocator, normalized, normalized_len, out) : status;
}

static inox_status inox_path_string(inox_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != INOX_TAG_STRING || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_string* string = (inox_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return INOX_OK;
}

static inox_status inox_path_string_result(inox_allocator* allocator, char* bytes, size_t len, inox_value* out) {
  if (bytes == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_string_from_literal(allocator, bytes, len, out);
  allocator->free(allocator->user, bytes, len + 1, alignof(char));

  return status;
}

static char* inox_path_alloc(inox_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  char* bytes = (char*)allocator->alloc(allocator->user, len + 1, alignof(char));

  if (bytes != 0) {
    bytes[len] = 0;
  }

  return bytes;
}

static inox_status inox_path_copy(inox_allocator* allocator, const char* bytes, size_t len, char** out, size_t* out_len) {
  char* copy = inox_path_alloc(allocator, len);

  if (copy == 0) {
    return INOX_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  *out = copy;
  *out_len = len;

  return INOX_OK;
}

static inox_status inox_path_normalize_bytes(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  if (bytes == 0 && len != 0) {
    return INOX_ERR_TYPE;
  }

  if (len == 0) {
    return inox_path_copy(allocator, ".", 1, out, out_len);
  }

  inox_path_span* segments = (inox_path_span*)allocator->alloc(allocator->user, sizeof(inox_path_span) * (len + 1), alignof(inox_path_span));

  if (segments == 0) {
    return INOX_ERR_OOM;
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
    allocator->free(allocator->user, segments, sizeof(inox_path_span) * (len + 1), alignof(inox_path_span));
    return absolute ? inox_path_copy(allocator, "/", 1, out, out_len) : inox_path_copy(allocator, ".", 1, out, out_len);
  }

  size_t result_len = absolute ? 1 : 0;

  for (size_t i = 0; i < count; i += 1) {
    result_len += segments[i].len + (i == 0 ? 0 : 1);
  }

  char* result = inox_path_alloc(allocator, result_len);

  if (result == 0) {
    allocator->free(allocator->user, segments, sizeof(inox_path_span) * (len + 1), alignof(inox_path_span));
    return INOX_ERR_OOM;
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

  allocator->free(allocator->user, segments, sizeof(inox_path_span) * (len + 1), alignof(inox_path_span));
  *out = result;
  *out_len = offset;

  return INOX_OK;
}

static inox_status inox_path_concat_values(
  inox_allocator* allocator,
  const inox_value* paths,
  size_t path_count,
  char** out,
  size_t* out_len
) {
  size_t total = 0;
  size_t non_empty = 0;

  for (size_t index = 0; index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    inox_status status = inox_path_string(paths[index], &bytes, &len);

    if (status != INOX_OK) {
      return status;
    }

    if (len != 0) {
      total += len + (non_empty == 0 ? 0 : 1);
      non_empty += 1;
    }
  }

  if (non_empty == 0) {
    return inox_path_copy(allocator, ".", 1, out, out_len);
  }

  char* joined = inox_path_alloc(allocator, total);

  if (joined == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;
  size_t emitted = 0;

  for (size_t index = 0; index < path_count; index += 1) {
    const char* bytes = 0;
    size_t len = 0;
    inox_status status = inox_path_string(paths[index], &bytes, &len);

    if (status != INOX_OK) {
      allocator->free(allocator->user, joined, total + 1, alignof(char));
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

  return INOX_OK;
}

static size_t inox_path_trim_trailing_slashes(const char* bytes, size_t len) {
  while (len > 1 && bytes[len - 1] == '/') {
    len -= 1;
  }

  return len;
}

static size_t inox_path_ext_offset(const char* bytes, size_t start, size_t len) {
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
    return len;
  }

  return dot - 1;
}

static int inox_path_ends_with(const char* bytes, size_t len, const char* suffix, size_t suffix_len) {
  return suffix_len <= len && memcmp(bytes + len - suffix_len, suffix, suffix_len) == 0;
}

static inox_status inox_path_object_string(
  inox_value object,
  const char* name,
  const char** bytes,
  size_t* len,
  int* present,
  inox_value* value
) {
  if (bytes == 0 || len == 0 || present == 0 || value == 0 || name == 0) {
    return INOX_ERR_TYPE;
  }

  *bytes = "";
  *len = 0;
  *present = 0;
  *value = inox_undefined_value();

  inox_status status = inox_object_get(object, name, strlen(name), value);

  if (status == INOX_ERR_FIELD) {
    return INOX_OK;
  }

  if (status != INOX_OK) {
    return status;
  }

  if (value->tag == INOX_TAG_UNDEFINED || value->tag == INOX_TAG_NULL) {
    return INOX_OK;
  }

  status = inox_path_string(*value, bytes, len);

  if (status != INOX_OK) {
    return status;
  }

  *present = 1;

  return INOX_OK;
}
