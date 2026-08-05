#include "inox/events.h"

#include <algorithm>
#include <cstring>
#include <functional>
#include <memory>
#include <new>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

#include "inox/class_descriptor.h"
#include "inox/loop.h"
#include "inox/string.h"

namespace inox {

const char eventEmitterInterface = 0;

namespace {

struct EventListenerEntry {
  Callback callback;
  bool once;
  std::size_t id;
};

std::string_view eventNameView(StringView event_name) {
  const char* bytes = event_name.bytes == nullptr ? "" : event_name.bytes;
  return std::string_view(bytes, event_name.len);
}

struct EventNameHash {
  using is_transparent = void;

  std::size_t operator()(std::string_view name) const noexcept {
    return std::hash<std::string_view>{}(name);
  }
};

struct EventNameEqual {
  using is_transparent = void;

  bool operator()(std::string_view left, std::string_view right) const noexcept {
    return left == right;
  }
};

using EventListeners = std::vector<EventListenerEntry>;
using EventListenerMap = std::unordered_map<std::string, EventListeners, EventNameHash, EventNameEqual>;

EventListenerMap::iterator findEvent(EventListenerMap& listeners, StringView event_name) {
  return listeners.find(eventNameView(event_name));
}

EventListenerMap::const_iterator findEvent(const EventListenerMap& listeners, StringView event_name) {
  return listeners.find(eventNameView(event_name));
}

bool eventNameEquals(StringView event_name, const char* expected) {
  const std::size_t expected_length = std::strlen(expected);
  return event_name.len == expected_length &&
         std::memcmp(event_name.bytes, expected, expected_length) == 0;
}

void throwEventError(const char* message) {
  throw_value(String(message == nullptr ? "EventEmitter operation failed" : message));
}

} // namespace

class EventEmitterState::Impl {
public:
  Impl(void* listener_context, EventEmitterListenerAdded listener_added)
    : listeners_(), listener_context_(listener_context), listener_added_(listener_added), next_listener_id_(0) {}

  void addListener(StringView event_name, Callback listener, bool once) {
    if (!listener.valid()) {
      throwEventError("TypeError: node:events listener must be a function");
      return;
    }

    try {
      auto stored = findEvent(listeners_, event_name);

      if (stored == listeners_.end()) {
        stored = listeners_.try_emplace(std::string(eventNameView(event_name))).first;
      }

      stored->second.push_back({std::move(listener), once, next_listener_id_});
      next_listener_id_ += 1;
    } catch (const std::bad_alloc&) {
      throw_out_of_memory();
      return;
    }

    if (listener_added_ != nullptr) listener_added_(listener_context_, event_name);
  }

  bool emit(StringView event_name, std::span<const Value> arguments) {
    const std::string_view name = eventNameView(event_name);
    auto stored = listeners_.find(name);

    if (stored == listeners_.end() || stored->second.empty()) {
      if (eventNameEquals(event_name, "error")) {
        if (arguments.empty()) throwEventError("Unhandled 'error' event");
        else throw_value(arguments.front().raw());
      }

      return false;
    }

    std::vector<EventListenerEntry> listeners;

    try {
      listeners = stored->second;
    } catch (const std::bad_alloc&) {
      throw_out_of_memory();
      return false;
    }

    for (const EventListenerEntry& listener : listeners) {
      if (listener.once) removeListener(name, listener.id);
      Value result = listener.callback.call(arguments);
      (void)result;
      if (thrown()) return true;
    }

    return true;
  }

  double listenerCount(StringView event_name) const {
    const auto listeners = findEvent(listeners_, event_name);
    return listeners == listeners_.end() ? 0 : static_cast<double>(listeners->second.size());
  }

  void removeAllListeners() { listeners_.clear(); }

  void removeAllListeners(StringView event_name) {
    const auto stored = findEvent(listeners_, event_name);
    if (stored != listeners_.end()) listeners_.erase(stored);
  }

  void removeListener(StringView event_name, const Callback& listener) {
    const auto stored = findEvent(listeners_, event_name);
    if (stored == listeners_.end()) return;

    std::vector<EventListenerEntry>& listeners = stored->second;

    for (std::size_t index = listeners.size(); index > 0; index -= 1) {
      if (listeners[index - 1].callback.same(listener)) {
        listeners.erase(listeners.begin() + static_cast<std::ptrdiff_t>(index - 1));
        break;
      }
    }

    if (listeners.empty()) listeners_.erase(stored);
  }

private:
  EventListenerMap listeners_;
  void* listener_context_;
  EventEmitterListenerAdded listener_added_;
  std::size_t next_listener_id_;

  void removeListener(std::string_view name, std::size_t id) {
    const auto stored = listeners_.find(name);
    if (stored == listeners_.end()) return;

    std::vector<EventListenerEntry>& listeners = stored->second;
    const auto listener = std::find_if(
      listeners.begin(),
      listeners.end(),
      [id](const EventListenerEntry& item) { return item.id == id; }
    );

    if (listener != listeners.end()) listeners.erase(listener);
    if (listeners.empty()) listeners_.erase(stored);
  }
};

EventEmitterState::EventEmitterState(
  void* listener_context,
  EventEmitterListenerAdded listener_added
)
  : impl_(std::make_unique<Impl>(listener_context, listener_added)) {}
EventEmitterState::~EventEmitterState() = default;

std::shared_ptr<EventEmitterState> EventEmitterState::create() {
  return create(nullptr, nullptr);
}

std::shared_ptr<EventEmitterState> EventEmitterState::create(
  void* listener_context,
  EventEmitterListenerAdded listener_added
) {
  try {
    return std::shared_ptr<EventEmitterState>(
      new EventEmitterState(listener_context, listener_added)
    );
  } catch (const std::bad_alloc&) {
    throw_out_of_memory();
    return {};
  }
}

void EventEmitterState::addListener(StringView event_name, Callback listener, bool once) {
  impl_->addListener(event_name, std::move(listener), once);
}

bool EventEmitterState::emit(StringView event_name, std::span<const Value> arguments) {
  return impl_->emit(event_name, arguments);
}

double EventEmitterState::listenerCount(StringView event_name) const {
  return impl_->listenerCount(event_name);
}

void EventEmitterState::removeAllListeners() { impl_->removeAllListeners(); }
void EventEmitterState::removeAllListeners(StringView event_name) { impl_->removeAllListeners(event_name); }
void EventEmitterState::removeListener(StringView event_name, const Callback& listener) {
  impl_->removeListener(event_name, listener);
}

} // namespace inox

namespace {

struct EventEmitterHolder {
  std::shared_ptr<inox::EventEmitterState> state;
};

void throwEventEmitterError(const char* message) {
  inox::throw_value(inox::String(message == nullptr ? "EventEmitter operation failed" : message));
}

inox_status copyEventEmitterHolder(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(EventEmitterHolder), alignof(EventEmitterHolder));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  try {
    *out = new (memory) EventEmitterHolder(*static_cast<const EventEmitterHolder*>(instance));
  } catch (const std::bad_alloc&) {
    allocator->free(allocator->user, memory, sizeof(EventEmitterHolder), alignof(EventEmitterHolder));
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

void destroyEventEmitterHolder(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) return;
  static_cast<EventEmitterHolder*>(instance)->~EventEmitterHolder();
  allocator->free(allocator->user, instance, sizeof(EventEmitterHolder), alignof(EventEmitterHolder));
}

inox_status readEventEmitterField(const void* instance, std::uint32_t index, inox_value* out) {
  (void)instance;
  (void)index;
  (void)out;
  return INOX_ERR_FIELD;
}

void* queryEventEmitterInterface(const void* instance, const void* interface_id) {
  if (instance == nullptr || interface_id != &inox::eventEmitterInterface) return nullptr;
  return static_cast<const EventEmitterHolder*>(instance)->state.get();
}

const inox_class_descriptor eventEmitterDescriptor = {
  "EventEmitter",
  0,
  nullptr,
  readEventEmitterField,
  copyEventEmitterHolder,
  destroyEventEmitterHolder,
  queryEventEmitterInterface,
};

inox::EventEmitterState* eventEmitterState(const EventEmitter& emitter) {
  const inox_value raw = emitter.raw();

  if (raw.tag != INOX_TAG_CLASS_INSTANCE || raw.as.ref == nullptr) return nullptr;

  const auto* ref = reinterpret_cast<const inox_class_instance_ref*>(raw.as.ref);

  if (ref->descriptor == nullptr || ref->instance == nullptr || ref->descriptor->query_interface == nullptr) {
    return nullptr;
  }

  return static_cast<inox::EventEmitterState*>(
    ref->descriptor->query_interface(ref->instance, &inox::eventEmitterInterface)
  );
}

inox::EventEmitterState* requireEventEmitterState(const EventEmitter& emitter, const char* operation) {
  inox::EventEmitterState* state = eventEmitterState(emitter);
  if (state == nullptr && !inox::thrown()) inox::fatal(operation);
  return state;
}

EventEmitter& addEventEmitterListener(
  EventEmitter& emitter,
  inox::StringView event_name,
  inox::Callback listener,
  bool once,
  const char* operation
) {
  inox::EventEmitterState* state = requireEventEmitterState(emitter, operation);
  if (state != nullptr) state->addListener(event_name, std::move(listener), once);
  return emitter;
}

EventEmitter& removeEventEmitterListener(
  EventEmitter& emitter,
  inox::StringView event_name,
  const inox::Callback& listener,
  const char* operation
) {
  inox::EventEmitterState* state = requireEventEmitterState(emitter, operation);
  if (state != nullptr) state->removeListener(event_name, listener);
  return emitter;
}

EventEmitter materializeEventEmitter(const std::shared_ptr<inox::EventEmitterState>& state) {
  if (!state) return EventEmitter();

  const EventEmitterHolder holder = {state};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &eventEmitterDescriptor,
    &holder,
    &value
  );

  if (status == INOX_ERR_OOM) inox::throw_out_of_memory();
  else if (status != INOX_OK) throwEventEmitterError("TypeError: EventEmitter materialization failed");

  return status == INOX_OK ? EventEmitter(inox::adopt(value)) : EventEmitter();
}

} // namespace

EventEmitter::EventEmitter() : inox::Value() {}
EventEmitter::EventEmitter(const inox::Value& value) : inox::Value(value) {}
EventEmitter::EventEmitter(inox::Value&& value) : inox::Value(std::move(value)) {}
EventEmitter::~EventEmitter() = default;

EventEmitter& EventEmitter::addListener(inox::StringView event_name, inox::Callback listener) {
  return addEventEmitterListener(
    *this,
    event_name,
    std::move(listener),
    false,
    "TypeError: EventEmitter.addListener failed"
  );
}

bool EventEmitter::emit(const inox::Value* arguments, std::size_t count) {
  if (arguments == nullptr || count == 0) {
    throwEventEmitterError("TypeError: EventEmitter.emit requires an event name");
    return false;
  }

  const inox::String event_name(arguments[0]);
  if (inox::thrown()) return false;

  inox::EventEmitterState* state = requireEventEmitterState(*this, "TypeError: EventEmitter.emit failed");
  if (state == nullptr) return false;

  const std::span<const inox::Value> event_arguments(arguments + 1, count - 1);
  return state->emit(event_name, event_arguments);
}

double EventEmitter::listenerCount(inox::StringView event_name) const {
  inox::EventEmitterState* state = requireEventEmitterState(*this, "TypeError: EventEmitter.listenerCount failed");
  return state == nullptr ? 0 : state->listenerCount(event_name);
}

EventEmitter& EventEmitter::off(inox::StringView event_name, inox::Callback listener) {
  return removeEventEmitterListener(
    *this,
    event_name,
    listener,
    "TypeError: EventEmitter.off failed"
  );
}

EventEmitter& EventEmitter::on(inox::StringView event_name, inox::Callback listener) {
  return addEventEmitterListener(
    *this,
    event_name,
    std::move(listener),
    false,
    "TypeError: EventEmitter.on failed"
  );
}

EventEmitter& EventEmitter::once(inox::StringView event_name, inox::Callback listener) {
  return addEventEmitterListener(
    *this,
    event_name,
    std::move(listener),
    true,
    "TypeError: EventEmitter.once failed"
  );
}

EventEmitter& EventEmitter::removeAllListeners(inox::StringView event_name, bool has_event_name) {
  inox::EventEmitterState* state = requireEventEmitterState(*this, "TypeError: EventEmitter.removeAllListeners failed");
  if (state != nullptr) {
    if (has_event_name) state->removeAllListeners(event_name);
    else state->removeAllListeners();
  }
  return *this;
}

EventEmitter& EventEmitter::removeListener(inox::StringView event_name, inox::Callback listener) {
  return removeEventEmitterListener(
    *this,
    event_name,
    listener,
    "TypeError: EventEmitter.removeListener failed"
  );
}

bool EventEmitter::valid() const { return eventEmitterState(*this) != nullptr; }

EventEmitter EventEmitter::create() {
  return materializeEventEmitter(inox::EventEmitterState::create());
}
