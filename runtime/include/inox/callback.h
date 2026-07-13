#ifndef INOX_CALLBACK_H
#define INOX_CALLBACK_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef inox_status (*inox_callback_call_fn)(void* context, const inox_value* args, size_t arg_count, inox_value* out);
typedef void (*inox_callback_finalizer_fn)(void* context);

typedef struct inox_callback {
  inox_ref header;
  inox_callback_call_fn call;
  void* context;
  inox_callback_finalizer_fn finalizer;
} inox_callback;

inox_status inox_callback_new(
  inox_allocator* allocator,
  inox_callback_call_fn call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
);
inox_status inox_callback_call(inox_value callback, const inox_value* args, size_t arg_count, inox_value* out);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

#include <span>

namespace inox {

class Callback {
private:
  Value value_;

public:
  Callback();
  Callback(inox_value value);
  Callback(const Value& value);
  Callback(Value&& value);
  Callback(const Callback& other);
  Callback(Callback&& other) noexcept;
  Callback& operator=(const Callback& other);
  Callback& operator=(Callback&& other) noexcept;
  ~Callback();

  bool valid() const;
  Value call() const;
  Value call(std::span<const Value> args) const;
};

} // namespace inox

#endif

#endif
