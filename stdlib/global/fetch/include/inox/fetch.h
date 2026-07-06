#ifndef INOX_FETCH_H
#define INOX_FETCH_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/promise.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/object.h"
#include "inox/string.h"
#include "inox/string_view.h"
#endif

#ifdef __cplusplus
namespace inox {

struct FetchHeader {
  StringView name;
  StringView value;
};

struct FetchInit {
  StringView method;
  const FetchHeader* headers;
  size_t header_count;
  StringView body;
  Value signal;
  StringView redirect;

  FetchInit();
  FetchInit(
    StringView method,
    const FetchHeader* headers,
    size_t header_count,
    StringView body,
    Value signal,
    StringView redirect
  );
};

class FetchResponse {
private:
  Value value_;

public:
  FetchResponse();

  explicit FetchResponse(Value value);

  bool valid() const;
  inox_number status() const;
  bool ok() const;
  bool redirected() const;
  Promise text() const;
  inox_value raw() const;
  operator inox_value() const;
};

class FetchHeaders : public Value {
public:
  FetchHeaders();
  explicit FetchHeaders(inox_value value);
  explicit FetchHeaders(const Value& value);

  bool has(StringView name) const;
  Value get(StringView name) const;
};

class AbortController : public Value {
public:
  AbortController();
  explicit AbortController(inox_value value);
  explicit AbortController(const Value& value);

  using Value::operator=;

  Value signal() const;
  void abort() const;
};

Promise fetch(StringView url);

Promise fetch(StringView url, const FetchInit* init);

} // namespace inox
#endif

#endif
