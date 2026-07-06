#ifndef INOX_FETCH_H
#define INOX_FETCH_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/loop.h"
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
  const FetchHeader* headers = nullptr;
  size_t header_count = 0;
  StringView body;
  Value signal;
  StringView redirect;
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
  Promise text(inox_loop* loop) const;
  Promise text() const;
  inox_value raw() const;
  operator inox_value() const;
};

Promise fetch(inox_loop* loop, StringView url);
Promise fetch(StringView url);
Promise fetch(const char* url);

Promise fetch(inox_loop* loop, StringView url, const FetchInit* init);
Promise fetch(StringView url, const FetchInit* init);
Promise fetch(const char* url, const FetchInit* init);

bool fetch_headers_has(inox_value headers, StringView name);
Value fetch_headers_get(inox_value headers, StringView name);
Value fetch_abort_controller();
Value fetch_abort_controller_signal(inox_value controller);
void fetch_abort_controller_abort(inox_value controller);

} // namespace inox
#endif

#endif
