#include <string.h>
#include "inox/binary.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/string.h"

static inox_status inox_bytes_allocate(inox_allocator* allocator, size_t len, inox_bytes** out);
static size_t inox_uint8_decimal_len(uint8_t value);
static size_t inox_uint8_write_decimal(uint8_t value, char* out);

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

inox_status inox_bytes_to_uint8array_string(inox_allocator* allocator, inox_value value, inox_value* out) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (
    allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || out == 0 ||
    value.tag != INOX_TAG_BYTES || value.as.ref == 0
  ) {
    return INOX_ERR_TYPE;
  }

  inox_bytes* bytes = (inox_bytes*)value.as.ref;

  if (bytes->len == 0) {
    return inox_string_from_literal(allocator, "", 0, out);
  }

  size_t total_len = 0;

  for (size_t index = 0; index < bytes->len; index += 1) {
    const size_t comma_len = index == 0 ? 0 : 1;
    const size_t digit_len = inox_uint8_decimal_len(bytes->bytes[index]);

    if (total_len > ((size_t)-1) - comma_len || total_len + comma_len > ((size_t)-1) - digit_len) {
      return INOX_ERR_OOM;
    }

    total_len += comma_len + digit_len;
  }

  char* text = allocator->alloc(allocator->user, total_len, _Alignof(char));

  if (text == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < bytes->len; index += 1) {
    if (index > 0) {
      text[offset] = ',';
      offset += 1;
    }

    offset += inox_uint8_write_decimal(bytes->bytes[index], text + offset);
  }

  inox_status status = inox_string_from_literal(allocator, text, total_len, out);
  allocator->free(allocator->user, text, total_len, _Alignof(char));

  return status;
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

static size_t inox_uint8_decimal_len(uint8_t value) {
  if (value >= 100) {
    return 3;
  }

  if (value >= 10) {
    return 2;
  }

  return 1;
}

static size_t inox_uint8_write_decimal(uint8_t value, char* out) {
  if (value >= 100) {
    out[0] = (char)('0' + (value / 100));
    out[1] = (char)('0' + ((value / 10) % 10));
    out[2] = (char)('0' + (value % 10));
    return 3;
  }

  if (value >= 10) {
    out[0] = (char)('0' + (value / 10));
    out[1] = (char)('0' + (value % 10));
    return 2;
  }

  out[0] = (char)('0' + value);
  return 1;
}
