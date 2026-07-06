#include "inox/url.h"

#include <ctype.h>
#include <string.h>
#include <unistd.h>
#include <utility>
#include "inox/loop.h"
#include "inox/string.h"

enum {
  INOX_URL_HREF_INDEX = 0,
  INOX_URL_PROTOCOL_INDEX = 1,
  INOX_URL_HOSTNAME_INDEX = 2,
  INOX_URL_PORT_INDEX = 3,
  INOX_URL_PATHNAME_INDEX = 4,
  INOX_URL_SEARCH_INDEX = 5,
  INOX_URL_HASH_INDEX = 6
};

enum { INOX_URL_SEARCH_PARAMS_QUERY_INDEX = 0 };

struct UrlSlice {
  const char* bytes;
  size_t length;
};

struct UrlParts {
  UrlSlice href;
  UrlSlice protocol;
  UrlSlice hostname;
  UrlSlice port;
  UrlSlice pathname;
  UrlSlice search;
  UrlSlice hash;
};

static inox_status inox_url_string(inox_value value, const char** bytes, size_t* len);
static inox_status inox_url_value_string(inox_value value, uint32_t object_field, inox_value* retained, const char** bytes, size_t* len);
static inox_status inox_url_parse(const char* bytes, size_t len, UrlParts* out);
static int inox_url_is_absolute(const char* bytes, size_t len);
static inox_status inox_url_object_from_parts(
  inox_allocator* allocator,
  const inox_shape* shape,
  const UrlParts* parts,
  inox_value* out
);
static inox_status inox_url_init_string_field(
  inox_allocator* allocator,
  inox_value object,
  uint32_t index,
  const char* bytes,
  size_t len
);
static inox_status inox_url_build_file_href(inox_allocator* allocator, const char* path, size_t path_len, char** out, size_t* out_len);
static inox_status inox_url_build_relative_href(
  inox_allocator* allocator,
  const char* input,
  size_t input_len,
  const UrlParts* base,
  char** out,
  size_t* out_len
);
static inox_status inox_url_decode_file_path(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static inox_status inox_url_normalized_field_value(
  inox_allocator* allocator,
  uint32_t field_index,
  const char* bytes,
  size_t len,
  inox_value* out
);
static inox_status inox_url_rebuild_href(inox_allocator* allocator, inox_value url);
static const inox_shape* inox_url_search_params_shape(void);
static inox_status inox_url_search_params_store_query(inox_allocator* allocator, inox_value params, const char* bytes, size_t len);
static inox_status inox_url_search_params_from_string(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static inox_status inox_url_search_params_from_object(inox_allocator* allocator, inox_value init, char** out, size_t* out_len);
static inox_status inox_url_search_params_append_pair(
  inox_allocator* allocator,
  char** query,
  size_t* query_len,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
static inox_status inox_url_search_params_remove_name(
  inox_allocator* allocator,
  const char* query,
  size_t query_len,
  const char* encoded_name,
  size_t encoded_name_len,
  char** out,
  size_t* out_len,
  int* removed
);
static int inox_url_search_params_has_encoded_name(
  const char* query,
  size_t query_len,
  const char* encoded_name,
  size_t encoded_name_len,
  const char** value,
  size_t* value_len
);
static inox_status inox_url_encode_query_component(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static inox_status inox_url_decode_query_component(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
);
static int inox_url_should_escape_query_char(unsigned char value);
static char* inox_url_alloc(inox_allocator* allocator, size_t len);
static int inox_url_hex_value(char value);
static int inox_url_should_escape_path_char(unsigned char value);
static void inox_url_write_hex(char* out, unsigned char value);

static void inox_url_throw_failed(const char* message) {
  inox::throw_value(inox::String(message == 0 ? "URL operation failed" : message));
}

URL::URL() : inox::Value() {}

URL::URL(inox_value value) : inox::Value(value) {}

URL::URL(const inox::Value& value) : inox::Value(value) {}

URL::URL(inox::Value&& value) : inox::Value(std::move(value)) {}

URL::URL(inox::AdoptValue adopt, inox_value value) : inox::Value(adopt, value) {}

bool URL::valid() const {
  inox_value value = raw();

  return value.tag == INOX_TAG_OBJECT && value.as.ref != 0;
}

inox::String url::fileURLToPath(const inox::Value& value) const {
  inox_value raw_value = value.raw();
  const char* bytes = 0;
  size_t len = 0;
  inox_value retained = inox_undefined_value();
  inox_status status = inox_url_value_string(raw_value, INOX_URL_HREF_INDEX, &retained, &bytes, &len);

  if (status != INOX_OK) {
    inox_url_throw_failed("fileURLToPath failed");
    return inox::String();
  }

  if (len < 7 || strncmp(bytes, "file://", 7) != 0) {
    inox_release(retained);
    inox_url_throw_failed("fileURLToPath failed");
    return inox::String();
  }

  const char* path = bytes + 7;
  size_t path_len = len - 7;
  size_t host_len = 0;

  while (host_len < path_len && path[host_len] != '/') {
    host_len += 1;
  }

  if (host_len != 0 && !(host_len == 9 && strncmp(path, "localhost", 9) == 0)) {
    inox_release(retained);
    inox_url_throw_failed("fileURLToPath failed");
    return inox::String();
  }

  path += host_len;
  path_len -= host_len;

  if (path_len == 0 || path[0] != '/') {
    inox_release(retained);
    inox_url_throw_failed("fileURLToPath failed");
    return inox::String();
  }

  char* decoded = 0;
  size_t decoded_len = 0;

  status = inox_url_decode_file_path(&inox_default_allocator, path, path_len, &decoded, &decoded_len);

  if (status != INOX_OK) {
    inox_release(retained);
    inox_url_throw_failed("fileURLToPath failed");
    return inox::String();
  }

  auto out = inox::String(decoded, decoded_len);
  inox_default_allocator.free(inox_default_allocator.user, decoded, decoded_len + 1, alignof(char));
  inox_release(retained);

  if (!out.valid()) {
    inox_url_throw_failed("fileURLToPath failed");
    return inox::String();
  }

  return out;
}

URL url::pathToFileURL(const inox::Value& path, const inox_shape* shape) const {
  inox_value raw_path = path.raw();
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_url_string(raw_path, &bytes, &len);

  if (status != INOX_OK) {
    inox_url_throw_failed("pathToFileURL failed");
    return URL();
  }

  char* href = 0;
  size_t href_len = 0;

  status = inox_url_build_file_href(&inox_default_allocator, bytes, len, &href, &href_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("pathToFileURL failed");
    return URL();
  }

  inox_value out = inox_undefined_value();
  UrlParts parts;
  status = inox_url_parse(href, href_len, &parts);

  if (status == INOX_OK) {
    status = inox_url_object_from_parts(&inox_default_allocator, shape, &parts, &out);
  }

  inox_default_allocator.free(inox_default_allocator.user, href, href_len + 1, alignof(char));

  if (status != INOX_OK) {
    inox_url_throw_failed("pathToFileURL failed");
    return URL();
  }

  return URL(inox::adopt_value, out);
}

URL URL::from(const inox::Value& input, const inox::Value& base, bool has_base, const inox_shape* shape) {
  inox_value raw_input = input.raw();
  inox_value raw_base = base.raw();
  const char* input_bytes = 0;
  size_t input_len = 0;
  inox_status status = inox_url_string(raw_input, &input_bytes, &input_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URL constructor failed");
    return URL();
  }

  if (inox_url_is_absolute(input_bytes, input_len)) {
    inox_value out = inox_undefined_value();
    UrlParts parts;
    status = inox_url_parse(input_bytes, input_len, &parts);

    if (status == INOX_OK) {
      status = inox_url_object_from_parts(&inox_default_allocator, shape, &parts, &out);
    }

    if (status != INOX_OK) {
      inox_url_throw_failed("URL constructor failed");
      return URL();
    }

    return URL(inox::adopt_value, out);
  }

  if (!has_base) {
    inox_url_throw_failed("URL constructor failed");
    return URL();
  }

  const char* base_bytes = 0;
  size_t base_len = 0;
  inox_value retained_base = inox_undefined_value();
  UrlParts base_parts;

  status = inox_url_value_string(raw_base, INOX_URL_HREF_INDEX, &retained_base, &base_bytes, &base_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URL constructor failed");
    return URL();
  }

  status = inox_url_parse(base_bytes, base_len, &base_parts);

  if (status != INOX_OK) {
    inox_release(retained_base);
    inox_url_throw_failed("URL constructor failed");
    return URL();
  }

  char* href = 0;
  size_t href_len = 0;

  status = inox_url_build_relative_href(&inox_default_allocator, input_bytes, input_len, &base_parts, &href, &href_len);

  if (status != INOX_OK) {
    inox_release(retained_base);
    inox_url_throw_failed("URL constructor failed");
    return URL();
  }

  inox_value out = inox_undefined_value();
  UrlParts parts;
  status = inox_url_parse(href, href_len, &parts);

  if (status == INOX_OK) {
    status = inox_url_object_from_parts(&inox_default_allocator, shape, &parts, &out);
  }

  inox_default_allocator.free(inox_default_allocator.user, href, href_len + 1, alignof(char));
  inox_release(retained_base);

  if (status != INOX_OK) {
    inox_url_throw_failed("URL constructor failed");
    return URL();
  }

  return URL(inox::adopt_value, out);
}

void URL::setField(uint32_t field_index, const inox::Value& value) {
  if (field_index != INOX_URL_PATHNAME_INDEX && field_index != INOX_URL_SEARCH_INDEX && field_index != INOX_URL_HASH_INDEX) {
    inox_url_throw_failed("URL field assignment failed");
    return;
  }

  inox_value raw_value = value.raw();
  const char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_url_string(raw_value, &bytes, &len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URL field assignment failed");
    return;
  }

  inox_value normalized = inox_undefined_value();
  status = inox_url_normalized_field_value(&inox_default_allocator, field_index, bytes, len, &normalized);

  if (status == INOX_OK) {
    status = inox_object_init_known(raw(), field_index, normalized);
  }

  inox_release(normalized);

  if (status != INOX_OK) {
    inox_url_throw_failed("URL field assignment failed");
    return;
  }

  status = inox_url_rebuild_href(&inox_default_allocator, raw());

  if (status != INOX_OK) {
    inox_url_throw_failed("URL field assignment failed");
  }
}

class url url;

static const inox_shape* inox_url_search_params_shape(void) {
  static const inox_field_info fields[] = {
    { "query", 0 },
  };
  static const inox_shape shape = {
    1,
    fields
  };

  return &shape;
}

inox::Value URLSearchParams::make(const inox::Value& init) {
  inox_value raw_init = init.raw();
  inox_value object = inox_undefined_value();
  inox_status status = inox_object_new(&inox_default_allocator, inox_url_search_params_shape(), &object);

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams constructor failed");
    return inox::Value();
  }

  char* query = 0;
  size_t query_len = 0;

  if (raw_init.tag == INOX_TAG_UNDEFINED || raw_init.tag == INOX_TAG_NULL) {
    query = inox_url_alloc(&inox_default_allocator, 0);

    if (query == 0) {
      status = INOX_ERR_OOM;
    }
  } else if (raw_init.tag == INOX_TAG_STRING) {
    const char* bytes = 0;
    size_t len = 0;

    status = inox_url_string(raw_init, &bytes, &len);

    if (status == INOX_OK) {
      status = inox_url_search_params_from_string(&inox_default_allocator, bytes, len, &query, &query_len);
    }
  } else if (raw_init.tag == INOX_TAG_OBJECT) {
    status = inox_url_search_params_from_object(&inox_default_allocator, raw_init, &query, &query_len);
  } else {
    status = INOX_ERR_TYPE;
  }

  if (status == INOX_OK) {
    status = inox_url_search_params_store_query(&inox_default_allocator, object, query, query_len);
  }

  if (query != 0) {
    inox_default_allocator.free(inox_default_allocator.user, query, query_len + 1, alignof(char));
  }

  if (status != INOX_OK) {
    inox_release(object);
    inox_url_throw_failed("URLSearchParams constructor failed");
    return inox::Value();
  }

  return inox::adopt(object);
}

inox::Value URLSearchParams::make(inox::StringView init) {
  inox_value object = inox_undefined_value();
  inox_status status = inox_object_new(&inox_default_allocator, inox_url_search_params_shape(), &object);

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams constructor failed");
    return inox::Value();
  }

  char* query = 0;
  size_t query_len = 0;
  status = inox_url_search_params_from_string(&inox_default_allocator, init.bytes == 0 ? "" : init.bytes, init.len, &query, &query_len);

  if (status == INOX_OK) {
    status = inox_url_search_params_store_query(&inox_default_allocator, object, query, query_len);
  }

  if (query != 0) {
    inox_default_allocator.free(inox_default_allocator.user, query, query_len + 1, alignof(char));
  }

  if (status != INOX_OK) {
    inox_release(object);
    inox_url_throw_failed("URLSearchParams constructor failed");
    return inox::Value();
  }

  return inox::adopt(object);
}

URLSearchParams::URLSearchParams() : inox::Value() {}

URLSearchParams::URLSearchParams(inox::StringView init) : inox::Value(make(init)) {}

URLSearchParams::URLSearchParams(inox_value value) : inox::Value(value) {}

URLSearchParams::URLSearchParams(const inox::Value& value) : inox::Value(value) {}

URLSearchParams::URLSearchParams(inox::AdoptValue adopt, inox_value value) : inox::Value(adopt, value) {}

URLSearchParams URLSearchParams::from(const inox::Value& init) {
  inox::Value value = make(init);

  return URLSearchParams(inox::adopt_value, value.release());
}

bool URLSearchParams::valid() const {
  inox_value value = raw();

  return value.tag == INOX_TAG_OBJECT && value.as.ref != 0;
}

void URLSearchParams::append(inox::StringView name, inox::StringView value) {
  inox_value retained = inox_undefined_value();
  const char* query_bytes = 0;
  size_t query_len = 0;
  inox_status status = inox_url_value_string(raw(), INOX_URL_SEARCH_PARAMS_QUERY_INDEX, &retained, &query_bytes, &query_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.append failed");
    return;
  }

  char* query = inox_url_alloc(&inox_default_allocator, query_len);

  if (query == 0) {
    inox_release(retained);
    inox_url_throw_failed("URLSearchParams.append failed");
    return;
  }

  memcpy(query, query_bytes, query_len);
  inox_release(retained);

  status = inox_url_search_params_append_pair(&inox_default_allocator, &query, &query_len, name.bytes, name.len, value.bytes, value.len);

  if (status == INOX_OK) {
    status = inox_url_search_params_store_query(&inox_default_allocator, raw(), query, query_len);
  }

  inox_default_allocator.free(inox_default_allocator.user, query, query_len + 1, alignof(char));

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.append failed");
  }
}

inox::Value URLSearchParams::get(inox::StringView name) const {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  inox_status status = inox_url_encode_query_component(&inox_default_allocator, name.bytes, name.len, &encoded_name, &encoded_name_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.get failed");
    return inox::Value();
  }

  inox_value retained = inox_undefined_value();
  const char* query = 0;
  size_t query_len = 0;
  const char* value = 0;
  size_t value_len = 0;
  inox::Value out;

  status = inox_url_value_string(raw(), INOX_URL_SEARCH_PARAMS_QUERY_INDEX, &retained, &query, &query_len);

  if (status == INOX_OK && inox_url_search_params_has_encoded_name(query, query_len, encoded_name, encoded_name_len, &value, &value_len)) {
    char* decoded = 0;
    size_t decoded_len = 0;

    status = inox_url_decode_query_component(&inox_default_allocator, value, value_len, &decoded, &decoded_len);

    if (status == INOX_OK) {
      inox::String decoded_string(decoded, decoded_len);

      if (decoded_string.valid()) {
        out = decoded_string;
      } else {
        status = INOX_ERR_OOM;
      }
    }

    if (decoded != 0) {
      inox_default_allocator.free(inox_default_allocator.user, decoded, decoded_len + 1, alignof(char));
    }
  } else if (status == INOX_OK) {
    out = inox_null_value();
  }

  inox_release(retained);
  inox_default_allocator.free(inox_default_allocator.user, encoded_name, encoded_name_len + 1, alignof(char));

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.get failed");
  }

  return out;
}

bool URLSearchParams::has(inox::StringView name) const {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  inox_status status = inox_url_encode_query_component(&inox_default_allocator, name.bytes, name.len, &encoded_name, &encoded_name_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.has failed");
    return false;
  }

  inox_value retained = inox_undefined_value();
  const char* query = 0;
  size_t query_len = 0;
  bool found = false;

  status = inox_url_value_string(raw(), INOX_URL_SEARCH_PARAMS_QUERY_INDEX, &retained, &query, &query_len);

  if (status == INOX_OK) {
    found = inox_url_search_params_has_encoded_name(query, query_len, encoded_name, encoded_name_len, 0, 0) != 0;
  }

  inox_release(retained);
  inox_default_allocator.free(inox_default_allocator.user, encoded_name, encoded_name_len + 1, alignof(char));

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.has failed");
    return false;
  }

  return found;
}

void URLSearchParams::remove(inox::StringView name) {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  inox_status status = inox_url_encode_query_component(&inox_default_allocator, name.bytes, name.len, &encoded_name, &encoded_name_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.delete failed");
    return;
  }

  inox_value retained = inox_undefined_value();
  const char* query = 0;
  size_t query_len = 0;

  status = inox_url_value_string(raw(), INOX_URL_SEARCH_PARAMS_QUERY_INDEX, &retained, &query, &query_len);

  char* next = 0;
  size_t next_len = 0;
  int removed = 0;

  if (status == INOX_OK) {
    status = inox_url_search_params_remove_name(&inox_default_allocator, query, query_len, encoded_name, encoded_name_len, &next, &next_len, &removed);
  }

  if (status == INOX_OK && removed) {
    status = inox_url_search_params_store_query(&inox_default_allocator, raw(), next, next_len);
  }

  if (next != 0) {
    inox_default_allocator.free(inox_default_allocator.user, next, next_len + 1, alignof(char));
  }

  inox_release(retained);
  inox_default_allocator.free(inox_default_allocator.user, encoded_name, encoded_name_len + 1, alignof(char));

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.delete failed");
  }
}

void URLSearchParams::set(inox::StringView name, inox::StringView value) {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  inox_status status = inox_url_encode_query_component(&inox_default_allocator, name.bytes, name.len, &encoded_name, &encoded_name_len);

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.set failed");
    return;
  }

  inox_value retained = inox_undefined_value();
  const char* query_bytes = 0;
  size_t query_len = 0;

  status = inox_url_value_string(raw(), INOX_URL_SEARCH_PARAMS_QUERY_INDEX, &retained, &query_bytes, &query_len);

  char* query = 0;
  size_t next_len = 0;

  if (status == INOX_OK) {
    status = inox_url_search_params_remove_name(
      &inox_default_allocator,
      query_bytes,
      query_len,
      encoded_name,
      encoded_name_len,
      &query,
      &next_len,
      0
    );
  }

  inox_release(retained);
  query_len = next_len;

  if (status == INOX_OK) {
    status = inox_url_search_params_append_pair(&inox_default_allocator, &query, &query_len, name.bytes, name.len, value.bytes, value.len);
  }

  if (status == INOX_OK) {
    status = inox_url_search_params_store_query(&inox_default_allocator, raw(), query, query_len);
  }

  if (query != 0) {
    inox_default_allocator.free(inox_default_allocator.user, query, query_len + 1, alignof(char));
  }

  inox_default_allocator.free(inox_default_allocator.user, encoded_name, encoded_name_len + 1, alignof(char));

  if (status != INOX_OK) {
    inox_url_throw_failed("URLSearchParams.set failed");
  }
}

inox::String URLSearchParams::toString() const {
  inox_value retained = inox_undefined_value();
  const char* query = 0;
  size_t query_len = 0;
  inox_status status = inox_url_value_string(raw(), INOX_URL_SEARCH_PARAMS_QUERY_INDEX, &retained, &query, &query_len);

  if (status != INOX_OK) {
    inox_release(retained);
    inox_url_throw_failed("URLSearchParams.toString failed");
    return inox::String();
  }

  inox::String out(query, query_len);
  inox_release(retained);

  if (!out.valid()) {
    inox_url_throw_failed("URLSearchParams.toString failed");
    return inox::String();
  }

  return out;
}

static inox_status inox_url_string(inox_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != INOX_TAG_STRING || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_string* string = (inox_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return INOX_OK;
}

static inox_status inox_url_value_string(inox_value value, uint32_t object_field, inox_value* retained, const char** bytes, size_t* len) {
  if (retained == 0) {
    return INOX_ERR_TYPE;
  }

  *retained = inox_undefined_value();

  if (value.tag == INOX_TAG_OBJECT) {
    inox_status status = inox_object_get_known(value, object_field, retained);

    if (status != INOX_OK) {
      return status;
    }

    return inox_url_string(*retained, bytes, len);
  }

  return inox_url_string(value, bytes, len);
}

static inox_status inox_url_parse(const char* bytes, size_t len, UrlParts* out) {
  if (bytes == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  const char* colon = (const char*)memchr(bytes, ':', len);

  if (colon == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  size_t scheme_len = (size_t)(colon - bytes);

  if (scheme_len == 0 || scheme_len + 2 >= len || colon[1] != '/' || colon[2] != '/') {
    return INOX_ERR_UNSUPPORTED;
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
  out->href.length = len;
  out->protocol.bytes = bytes;
  out->protocol.length = scheme_len + 1;
  out->hostname.bytes = authority;
  out->hostname.length = (size_t)(port - authority);
  out->port.bytes = port < host_end ? port + 1 : "";
  out->port.length = port < host_end ? (size_t)(host_end - port - 1) : 0;
  out->pathname.bytes = path;
  out->pathname.length = path_len;
  out->search.bytes = search < end ? search : "";
  out->search.length = search < end ? (size_t)((hash < end ? hash : end) - search) : 0;
  out->hash.bytes = hash < end ? hash : "";
  out->hash.length = hash < end ? (size_t)(end - hash) : 0;

  return INOX_OK;
}

static int inox_url_is_absolute(const char* bytes, size_t len) {
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

static inox_status inox_url_object_from_parts(
  inox_allocator* allocator,
  const inox_shape* shape,
  const UrlParts* parts,
  inox_value* out
) {
  inox_value object = inox_undefined_value();
  inox_status status = inox_object_new(allocator, shape, &object);

  if (status == INOX_OK) {
    status = inox_url_init_string_field(allocator, object, INOX_URL_HREF_INDEX, parts->href.bytes, parts->href.length);
  }

  if (status == INOX_OK) {
    status = inox_url_init_string_field(allocator, object, INOX_URL_PROTOCOL_INDEX, parts->protocol.bytes, parts->protocol.length);
  }

  if (status == INOX_OK) {
    status = inox_url_init_string_field(allocator, object, INOX_URL_HOSTNAME_INDEX, parts->hostname.bytes, parts->hostname.length);
  }

  if (status == INOX_OK) {
    status = inox_url_init_string_field(allocator, object, INOX_URL_PORT_INDEX, parts->port.bytes, parts->port.length);
  }

  if (status == INOX_OK) {
    status = inox_url_init_string_field(allocator, object, INOX_URL_PATHNAME_INDEX, parts->pathname.bytes, parts->pathname.length);
  }

  if (status == INOX_OK) {
    status = inox_url_init_string_field(allocator, object, INOX_URL_SEARCH_INDEX, parts->search.bytes, parts->search.length);
  }

  if (status == INOX_OK) {
    status = inox_url_init_string_field(allocator, object, INOX_URL_HASH_INDEX, parts->hash.bytes, parts->hash.length);
  }

  if (status == INOX_OK) {
    *out = object;
    return INOX_OK;
  }

  inox_release(object);
  *out = inox_undefined_value();

  return status;
}

static inox_status inox_url_init_string_field(
  inox_allocator* allocator,
  inox_value object,
  uint32_t index,
  const char* bytes,
  size_t len
) {
  auto value = inox::String(bytes == 0 ? "" : bytes, len);
  inox_status status = value.valid() ? INOX_OK : INOX_ERR_OOM;

  if (status == INOX_OK) {
    status = inox_object_init_known(object, index, value);
  }

  return status;
}

static inox_status inox_url_build_file_href(
  inox_allocator* allocator,
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
      return INOX_ERR_UNSUPPORTED;
    }

    cwd_len = strlen(cwd);
  }

  size_t escaped_len = 0;

  for (size_t index = 0; index < base_len; index += 1) {
    escaped_len += inox_url_should_escape_path_char((unsigned char)base[index]) ? 3 : 1;
  }

  size_t total = prefix_len + cwd_len + (needs_cwd ? 1 : 0) + escaped_len;
  char* href = inox_url_alloc(allocator, total);

  if (href == 0) {
    return INOX_ERR_OOM;
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

    if (inox_url_should_escape_path_char(value)) {
      inox_url_write_hex(href + offset, value);
      offset += 3;
    } else {
      href[offset] = (char)value;
      offset += 1;
    }
  }

  *out = href;
  *out_len = offset;

  return INOX_OK;
}

static inox_status inox_url_build_relative_href(
  inox_allocator* allocator,
  const char* input,
  size_t input_len,
  const UrlParts* base,
  char** out,
  size_t* out_len
) {
  const char* query = (const char*)memchr(input, '?', input_len);
  const char* hash = (const char*)memchr(input, '#', input_len);
  const char* suffix = query != 0 && (hash == 0 || query < hash) ? query : hash;
  size_t path_len = suffix == 0 ? input_len : (size_t)(suffix - input);
  size_t suffix_len = suffix == 0 ? 0 : input_len - path_len;
  size_t base_origin_len = base->protocol.length + 2 + base->hostname.length + (base->port.length == 0 ? 0 : 1 + base->port.length);
  size_t base_dir_len = 1;

  if (path_len == 0 || input[0] != '/') {
    base_dir_len = base->pathname.length;

    while (base_dir_len > 0 && base->pathname.bytes[base_dir_len - 1] != '/') {
      base_dir_len -= 1;
    }
  }

  size_t total = base_origin_len + (path_len != 0 && input[0] == '/' ? path_len : base_dir_len + path_len) + suffix_len;
  char* href = inox_url_alloc(allocator, total);

  if (href == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;
  memcpy(href + offset, base->protocol.bytes, base->protocol.length);
  offset += base->protocol.length;
  href[offset++] = '/';
  href[offset++] = '/';
  memcpy(href + offset, base->hostname.bytes, base->hostname.length);
  offset += base->hostname.length;

  if (base->port.length != 0) {
    href[offset++] = ':';
    memcpy(href + offset, base->port.bytes, base->port.length);
    offset += base->port.length;
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

  return INOX_OK;
}

static inox_status inox_url_decode_file_path(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  char* decoded = inox_url_alloc(allocator, len);

  if (decoded == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < len; index += 1) {
    if (bytes[index] == '%' && index + 2 < len) {
      int high = inox_url_hex_value(bytes[index + 1]);
      int low = inox_url_hex_value(bytes[index + 2]);

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

  return INOX_OK;
}

static inox_status inox_url_normalized_field_value(
  inox_allocator* allocator,
  uint32_t field_index,
  const char* bytes,
  size_t len,
  inox_value* out
) {
  char prefix = 0;

  if (field_index == INOX_URL_PATHNAME_INDEX) {
    prefix = '/';
  } else if (field_index == INOX_URL_SEARCH_INDEX) {
    prefix = '?';
  } else if (field_index == INOX_URL_HASH_INDEX) {
    prefix = '#';
  }

  if (field_index == INOX_URL_PATHNAME_INDEX && len == 0) {
    auto value = inox::String("/", 1);
    return value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
  }

  if (prefix == 0 || len == 0 || bytes[0] == prefix) {
    auto value = inox::String(bytes, len);
    return value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
  }

  char* normalized = inox_url_alloc(allocator, len + 1);

  if (normalized == 0) {
    return INOX_ERR_OOM;
  }

  normalized[0] = prefix;
  memcpy(normalized + 1, bytes, len);
  auto value = inox::String(normalized, len + 1);
  inox_status status = value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
  allocator->free(allocator->user, normalized, len + 2, alignof(char));

  return status;
}

static inox_status inox_url_rebuild_href(inox_allocator* allocator, inox_value url) {
  enum { FIELD_COUNT = 6 };
  const uint32_t indexes[FIELD_COUNT] = {
    INOX_URL_PROTOCOL_INDEX,
    INOX_URL_HOSTNAME_INDEX,
    INOX_URL_PORT_INDEX,
    INOX_URL_PATHNAME_INDEX,
    INOX_URL_SEARCH_INDEX,
    INOX_URL_HASH_INDEX
  };
  inox_value values[FIELD_COUNT];
  const char* bytes[FIELD_COUNT];
  size_t lens[FIELD_COUNT];

  for (size_t index = 0; index < FIELD_COUNT; index += 1) {
    values[index] = inox_undefined_value();
    bytes[index] = 0;
    lens[index] = 0;
  }

  inox_status status = INOX_OK;

  for (size_t index = 0; index < FIELD_COUNT; index += 1) {
    status = inox_url_value_string(url, indexes[index], &values[index], &bytes[index], &lens[index]);

    if (status != INOX_OK) {
      for (size_t release_index = 0; release_index <= index; release_index += 1) {
        inox_release(values[release_index]);
      }

      return status;
    }
  }

  size_t total = lens[0] + 2 + lens[1] + (lens[2] == 0 ? 0 : 1 + lens[2]) + lens[3] + lens[4] + lens[5];
  char* href = inox_url_alloc(allocator, total);

  if (href == 0) {
    for (size_t index = 0; index < FIELD_COUNT; index += 1) {
      inox_release(values[index]);
    }

    return INOX_ERR_OOM;
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

  auto href_value = inox::String(href, offset);
  status = href_value.valid() ? INOX_OK : INOX_ERR_OOM;

  if (status == INOX_OK) {
    status = inox_object_init_known(url, INOX_URL_HREF_INDEX, href_value);
  }

  allocator->free(allocator->user, href, total + 1, alignof(char));

  for (size_t index = 0; index < FIELD_COUNT; index += 1) {
    inox_release(values[index]);
  }

  return status;
}

static inox_status inox_url_search_params_store_query(inox_allocator* allocator, inox_value params, const char* bytes, size_t len) {
  auto value = inox::String(bytes == 0 ? "" : bytes, len);
  inox_status status = value.valid() ? INOX_OK : INOX_ERR_OOM;

  if (status == INOX_OK) {
    status = inox_object_init_known(params, INOX_URL_SEARCH_PARAMS_QUERY_INDEX, value);
  }

  return status;
}

static inox_status inox_url_search_params_from_string(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  if (bytes == 0 || out == 0 || out_len == 0) {
    return INOX_ERR_TYPE;
  }

  if (len != 0 && bytes[0] == '?') {
    bytes += 1;
    len -= 1;
  }

  char* query = inox_url_alloc(allocator, len);

  if (query == 0) {
    return INOX_ERR_OOM;
  }

  memcpy(query, bytes, len);
  *out = query;
  *out_len = len;

  return INOX_OK;
}

static inox_status inox_url_search_params_from_object(inox_allocator* allocator, inox_value init, char** out, size_t* out_len) {
  if (init.tag != INOX_TAG_OBJECT || init.as.ref == 0 || out == 0 || out_len == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* object = (inox_object*)init.as.ref;
  char* query = inox_url_alloc(allocator, 0);

  if (query == 0) {
    return INOX_ERR_OOM;
  }

  size_t query_len = 0;
  inox_status status = INOX_OK;

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    inox_value value = inox_undefined_value();
    status = inox_object_get_known(init, index, &value);

    if (status != INOX_OK) {
      break;
    }

    const char* value_bytes = 0;
    size_t value_len = 0;
    status = inox_url_string(value, &value_bytes, &value_len);

    if (status == INOX_OK) {
      const char* key = object->shape->fields[index].name == 0 ? "" : object->shape->fields[index].name;
      status = inox_url_search_params_append_pair(allocator, &query, &query_len, key, strlen(key), value_bytes, value_len);
    }

    inox_release(value);

    if (status != INOX_OK) {
      break;
    }
  }

  if (status != INOX_OK) {
    allocator->free(allocator->user, query, query_len + 1, alignof(char));
    return status;
  }

  *out = query;
  *out_len = query_len;

  return INOX_OK;
}

static inox_status inox_url_search_params_append_pair(
  inox_allocator* allocator,
  char** query,
  size_t* query_len,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
) {
  char* encoded_name = 0;
  size_t encoded_name_len = 0;
  inox_status status = inox_url_encode_query_component(allocator, name, name_len, &encoded_name, &encoded_name_len);

  if (status != INOX_OK) {
    return status;
  }

  char* encoded_value = 0;
  size_t encoded_value_len = 0;
  status = inox_url_encode_query_component(allocator, value, value_len, &encoded_value, &encoded_value_len);

  if (status != INOX_OK) {
    allocator->free(allocator->user, encoded_name, encoded_name_len + 1, alignof(char));
    return status;
  }

  size_t old_len = *query_len;
  size_t separator_len = old_len == 0 ? 0 : 1;
  size_t next_len = old_len + separator_len + encoded_name_len + 1 + encoded_value_len;
  char* next = inox_url_alloc(allocator, next_len);

  if (next == 0) {
    allocator->free(allocator->user, encoded_name, encoded_name_len + 1, alignof(char));
    allocator->free(allocator->user, encoded_value, encoded_value_len + 1, alignof(char));
    return INOX_ERR_OOM;
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
    allocator->free(allocator->user, *query, *query_len + 1, alignof(char));
  }

  *query = next;
  *query_len = offset;

  allocator->free(allocator->user, encoded_name, encoded_name_len + 1, alignof(char));
  allocator->free(allocator->user, encoded_value, encoded_value_len + 1, alignof(char));

  return INOX_OK;
}

static inox_status inox_url_search_params_remove_name(
  inox_allocator* allocator,
  const char* query,
  size_t query_len,
  const char* encoded_name,
  size_t encoded_name_len,
  char** out,
  size_t* out_len,
  int* removed
) {
  char* next = inox_url_alloc(allocator, 0);

  if (next == 0) {
    return INOX_ERR_OOM;
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
      char* combined = inox_url_alloc(allocator, combined_len);

      if (combined == 0) {
        allocator->free(allocator->user, next, next_len + 1, alignof(char));
        return INOX_ERR_OOM;
      }

      size_t offset = 0;

      if (next_len != 0) {
        memcpy(combined + offset, next, next_len);
        offset += next_len;
        combined[offset++] = '&';
      }

      memcpy(combined + offset, query + pair_start, segment_len);
      offset += segment_len;
      allocator->free(allocator->user, next, next_len + 1, alignof(char));
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

  return INOX_OK;
}

static int inox_url_search_params_has_encoded_name(
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

static inox_status inox_url_encode_query_component(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  size_t encoded_len = 0;

  for (size_t index = 0; index < len; index += 1) {
    unsigned char value = (unsigned char)bytes[index];
    encoded_len += value == ' ' ? 1 : inox_url_should_escape_query_char(value) ? 3 : 1;
  }

  char* encoded = inox_url_alloc(allocator, encoded_len);

  if (encoded == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < len; index += 1) {
    unsigned char value = (unsigned char)bytes[index];

    if (value == ' ') {
      encoded[offset++] = '+';
    } else if (inox_url_should_escape_query_char(value)) {
      inox_url_write_hex(encoded + offset, value);
      offset += 3;
    } else {
      encoded[offset++] = (char)value;
    }
  }

  *out = encoded;
  *out_len = offset;

  return INOX_OK;
}

static inox_status inox_url_decode_query_component(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  char** out,
  size_t* out_len
) {
  char* decoded = inox_url_alloc(allocator, len);

  if (decoded == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < len; index += 1) {
    if (bytes[index] == '+') {
      decoded[offset++] = ' ';
      continue;
    }

    if (bytes[index] == '%' && index + 2 < len) {
      int high = inox_url_hex_value(bytes[index + 1]);
      int low = inox_url_hex_value(bytes[index + 2]);

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

  return INOX_OK;
}

static char* inox_url_alloc(inox_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  char* bytes = (char*)allocator->alloc(allocator->user, len + 1, alignof(char));

  if (bytes != 0) {
    bytes[len] = 0;
  }

  return bytes;
}

static int inox_url_hex_value(char value) {
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

static int inox_url_should_escape_path_char(unsigned char value) {
  return !(isalnum(value) || value == '/' || value == '.' || value == '-' || value == '_' || value == '~');
}

static int inox_url_should_escape_query_char(unsigned char value) {
  return !(isalnum(value) || value == '*' || value == '-' || value == '.' || value == '_');
}

static void inox_url_write_hex(char* out, unsigned char value) {
  static const char* digits = "0123456789ABCDEF";

  out[0] = '%';
  out[1] = digits[(value >> 4) & 0x0f];
  out[2] = digits[value & 0x0f];
}
