#ifndef INOX_FETCH_H
#define INOX_FETCH_H

#include "inox/object.h"
#include "inox/promise.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

namespace inox {

class FetchHeaders : public Value {
public:
  FetchHeaders();
  explicit FetchHeaders(const Value& value);

  bool has(StringView name) const;
  Value get(StringView name) const;
};

class AbortSignal : public Value {
public:
  bool aborted;

  AbortSignal();
  explicit AbortSignal(const Value& value);
};

class AbortController : public Value {
public:
  mutable AbortSignal signal;

  AbortController();
  explicit AbortController(const Value& value);

  using Value::operator=;

  void abort() const;
};

class FetchResponse {
private:
  Value value_;

public:
  inox_number status;
  bool ok;
  String url;
  String statusText;
  bool redirected;
  FetchHeaders headers;

  FetchResponse();
  explicit FetchResponse(Value value);

  Promise bytes() const;
  Promise json() const;
  Promise text() const;
};

Promise fetch(StringView url);
Promise fetch(StringView url, const Value& init);

} // namespace inox

#endif
