#ifndef INOX_EVENTS_H
#define INOX_EVENTS_H

#include <cstddef>
#include <memory>
#include <span>

#include "inox/callback.h"
#include "inox/string_view.h"
#include "inox/value.h"

namespace inox {

extern const char eventEmitterInterface;

using EventEmitterListenerAdded = void (*)(void* context, StringView event_name);

class EventEmitterState {
public:
  class Impl;

  EventEmitterState(const EventEmitterState&) = delete;
  EventEmitterState& operator=(const EventEmitterState&) = delete;
  ~EventEmitterState();

  static std::shared_ptr<EventEmitterState> create();
  static std::shared_ptr<EventEmitterState> create(
    void* listener_context,
    EventEmitterListenerAdded listener_added
  );

  void addListener(StringView event_name, Callback listener, bool once);
  bool emit(StringView event_name, std::span<const Value> arguments);
  double listenerCount(StringView event_name) const;
  void removeAllListeners();
  void removeAllListeners(StringView event_name);
  void removeListener(StringView event_name, const Callback& listener);

private:
  EventEmitterState(void* listener_context, EventEmitterListenerAdded listener_added);

  std::unique_ptr<Impl> impl_;
};

} // namespace inox

class EventEmitter : public inox::Value {
public:
  EventEmitter();
  explicit EventEmitter(const inox::Value& value);
  explicit EventEmitter(inox::Value&& value);
  virtual ~EventEmitter();

  using inox::Value::operator=;

  virtual EventEmitter& addListener(inox::StringView event_name, inox::Callback listener);
  bool emit(const inox::Value* arguments, std::size_t count);
  double listenerCount(inox::StringView event_name) const;
  EventEmitter& off(inox::StringView event_name, inox::Callback listener);
  virtual EventEmitter& on(inox::StringView event_name, inox::Callback listener);
  virtual EventEmitter& once(inox::StringView event_name, inox::Callback listener);
  EventEmitter& removeAllListeners(inox::StringView event_name, bool has_event_name);
  EventEmitter& removeListener(inox::StringView event_name, inox::Callback listener);
  bool valid() const;

  static EventEmitter create();
};

#endif
