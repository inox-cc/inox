#include <string.h>
#include "inox/binary.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/string.h"

static inox_status inox_bytes_allocate(inox_allocator* allocator, size_t len, inox_bytes** out);

inox_status inox_bytes_new(inox_allocator* allocator, size_t len, inox_value* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  inox_bytes* bytes = 0;
  inox_status status = inox_bytes_allocate(allocator, len, &bytes);

  if (status != INOX_OK) {
    return status;
  }

  if (len != 0) {
    memset(bytes->bytes, 0, len);
  }

  out->tag = INOX_TAG_BYTES;
  out->as.ref = &bytes->header;

  return INOX_OK;
}

inox_status inox_bytes_from_data(inox_allocator* allocator, const uint8_t* data, size_t len, inox_value* out) {
  if (out == 0 || (data == 0 && len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  inox_bytes* bytes = 0;
  inox_status status = inox_bytes_allocate(allocator, len, &bytes);

  if (status != INOX_OK) {
    return status;
  }

  if (len != 0) {
    memcpy(bytes->bytes, data, len);
  }

  out->tag = INOX_TAG_BYTES;
  out->as.ref = &bytes->header;

  return INOX_OK;
}

inox_status inox_bytes_get(inox_value value, size_t index, uint8_t* out) {
  if (out == 0 || value.tag != INOX_TAG_BYTES || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_bytes* bytes = (inox_bytes*)value.as.ref;

  if (index >= bytes->len) {
    *out = 0;
    return INOX_ERR_FIELD;
  }

  *out = bytes->bytes[index];

  return INOX_OK;
}

inox_status inox_bytes_len(inox_value value, size_t* out) {
  if (out == 0 || value.tag != INOX_TAG_BYTES || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_bytes* bytes = (inox_bytes*)value.as.ref;
  *out = bytes->len;

  return INOX_OK;
}

inox_status inox_bytes_set(inox_value value, size_t index, uint8_t byte) {
  if (value.tag != INOX_TAG_BYTES || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_bytes* bytes = (inox_bytes*)value.as.ref;

  if (index >= bytes->len) {
    return INOX_ERR_FIELD;
  }

  bytes->bytes[index] = byte;

  return INOX_OK;
}

inox_status inox_bytes_slice(inox_value value, size_t start, size_t end, inox_value* out) {
  if (out == 0 || value.tag != INOX_TAG_BYTES || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  inox_bytes* source = (inox_bytes*)value.as.ref;

  if (start > source->len) {
    start = source->len;
  }

  if (end > source->len) {
    end = source->len;
  }

  if (end < start) {
    end = start;
  }

  return inox_bytes_from_data(source->header.allocator, source->bytes + start, end - start, out);
}

inox_status inox_bytes_to_string(inox_allocator* allocator, inox_value value, inox_value* out) {
  if (out == 0 || value.tag != INOX_TAG_BYTES || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_bytes* bytes = (inox_bytes*)value.as.ref;

  return inox_string_from_literal(allocator, (const char*)bytes->bytes, bytes->len, out);
}

static inox_status inox_bytes_allocate(inox_allocator* allocator, size_t len, inox_bytes** out) {
  if (out == 0 || allocator == 0 || allocator->alloc == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (len > ((size_t)-1) - sizeof(inox_bytes)) {
    return INOX_ERR_OOM;
  }

  size_t size = sizeof(inox_bytes) + len;
  inox_bytes* bytes = allocator->alloc(allocator->user, size, _Alignof(inox_bytes));

  if (bytes == 0) {
    return INOX_ERR_OOM;
  }

  bytes->header.kind = INOX_REF_BYTES;
  bytes->header.ref_count = 1;
  bytes->header.flags = 0;
  bytes->header.size = size;
  bytes->header.align = _Alignof(inox_bytes);
  bytes->header.allocator = allocator;
  inox_ref_init_weak(&bytes->header);
  bytes->len = len;
  *out = bytes;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_BYTES);
#endif

  return INOX_OK;
}
