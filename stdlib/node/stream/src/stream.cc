#include "inox/stream.h"

#include <array>
#include <cstddef>
#include <cstring>
#include <deque>
#include <memory>
#include <new>
#include <span>
#include <utility>
#include <vector>

#include "inox/buffer.h"
#include "inox/class_descriptor.h"
#include "inox/loop.h"

namespace {

constexpr std::size_t streamHighWaterMark = 16 * 1024;

void throwStreamError(const char* message) {
  inox::throw_value(inox::String(message == nullptr ? "stream operation failed" : message));
}

void streamListenerAdded(void* context, inox::StringView event_name);

} // namespace

class Stream::Impl : public std::enable_shared_from_this<Stream::Impl> {
public:
  Impl()
    : events_(inox::EventEmitterState::create(this, streamListenerAdded)),
      chunks_(),
      pipes_(),
      queued_bytes_(0),
      flowing_(false),
      paused_(false),
      backpressured_(false),
      writable_ended_(false),
      readable_ended_(false),
      end_emitted_(false),
      destroyed_(false) {}

  void addListener(inox::StringView event_name, inox::Callback listener, bool once) {
    if (events_) events_->addListener(event_name, std::move(listener), once);
  }

  std::shared_ptr<inox::EventEmitterState> events() const { return events_; }

  void listenerAdded(inox::StringView event_name) {
    if (event_name.len != 4 || std::memcmp(event_name.bytes, "data", 4) != 0) return;
    flowing_ = true;
    paused_ = false;
    flush();
  }

  void addPipe(const std::shared_ptr<Impl>& destination) {
    if (!destination || destination.get() == this) {
      throwStreamError("TypeError: invalid node:stream pipe destination");
      return;
    }

    try {
      pipes_.push_back(destination);
    } catch (const std::bad_alloc&) {
      inox::throw_out_of_memory();
      return;
    }

    flowing_ = true;
    paused_ = false;
    flush();
  }

  void destroy() {
    if (destroyed_) return;
    destroyed_ = true;
    chunks_.clear();
    queued_bytes_ = 0;
    emit("close");
    clearListeners();
    pipes_.clear();
  }

  bool destroyed() const { return destroyed_; }
  bool isPaused() const { return paused_; }

  void end(inox::Callback callback) {
    if (destroyed_) {
      throwStreamError("TypeError: cannot end a destroyed stream");
      return;
    }

    if (writable_ended_) {
      throwStreamError("TypeError: write after end");
      return;
    }

    if (callback.valid()) addFinishCallback(std::move(callback));
    if (inox::thrown()) return;

    writable_ended_ = true;
    emit("finish");
    if (inox::thrown()) return;
    emitEndIfReady();
  }

  void end(const Buffer& chunk, inox::Callback callback) {
    if (!write(chunk, inox::Callback())) return;
    end(std::move(callback));
  }

  void pause() {
    flowing_ = false;
    paused_ = true;
  }

  bool readable() const { return !destroyed_ && !end_emitted_; }
  bool readableEnded() const { return readable_ended_; }
  double readableLength() const { return static_cast<double>(queued_bytes_); }

  void resume() {
    if (destroyed_) return;
    flowing_ = true;
    paused_ = false;
    flush();
  }

  bool writable() const { return !destroyed_ && !writable_ended_; }
  bool writableEnded() const { return writable_ended_; }
  double writableLength() const { return static_cast<double>(queued_bytes_); }

  bool write(const Buffer& chunk, inox::Callback callback) {
    if (destroyed_ || writable_ended_) {
      throwStreamError("TypeError: write after end");
      return false;
    }

    if (!chunk.valid()) {
      throwStreamError("TypeError: node:stream chunk must be a string, Buffer, or Uint8Array");
      return false;
    }

    const bool has_consumers = flowing_ || hasLivePipe();

    if (has_consumers) {
      emitData(chunk);
    } else {
      try {
        chunks_.push_back(chunk);
      } catch (const std::bad_alloc&) {
        inox::throw_out_of_memory();
        return false;
      }

      queued_bytes_ += chunk.length();
      if (queued_bytes_ >= streamHighWaterMark) backpressured_ = true;
    }

    if (!inox::thrown() && callback.valid()) {
      inox::Value result = callback.call();
      (void)result;
    }

    return !inox::thrown() && !backpressured_;
  }

private:
  std::shared_ptr<inox::EventEmitterState> events_;
  std::deque<Buffer> chunks_;
  std::vector<std::weak_ptr<Impl>> pipes_;
  std::size_t queued_bytes_;
  bool flowing_;
  bool paused_;
  bool backpressured_;
  bool writable_ended_;
  bool readable_ended_;
  bool end_emitted_;
  bool destroyed_;

  void addFinishCallback(inox::Callback callback) {
    if (events_) events_->addListener("finish", std::move(callback), true);
  }

  void clearListeners() {
    if (events_) events_->removeAllListeners();
  }

  void emit(inox::StringView event_name) {
    if (events_) events_->emit(event_name, {});
  }

  void emitData(const Buffer& chunk) {
    const inox::Value argument(chunk.raw());
    const std::array<inox::Value, 1> arguments = {argument};
    if (events_) events_->emit("data", arguments);
    if (inox::thrown()) return;

    for (std::size_t index = 0; index < pipes_.size();) {
      std::shared_ptr<Impl> destination = pipes_[index].lock();

      if (!destination) {
        pipes_.erase(pipes_.begin() + static_cast<std::ptrdiff_t>(index));
        continue;
      }

      destination->write(chunk, inox::Callback());
      if (inox::thrown()) return;
      index += 1;
    }
  }

  void emitEndIfReady() {
    if (!writable_ended_ || end_emitted_ || !chunks_.empty()) return;

    readable_ended_ = true;
    end_emitted_ = true;
    emit("end");
    if (inox::thrown()) return;

    for (std::size_t index = 0; index < pipes_.size(); index += 1) {
      std::shared_ptr<Impl> destination = pipes_[index].lock();
      if (destination) destination->end(inox::Callback());
      if (inox::thrown()) return;
    }
  }

  void flush() {
    while (flowing_ && !chunks_.empty()) {
      Buffer chunk = std::move(chunks_.front());
      chunks_.pop_front();
      queued_bytes_ -= chunk.length();
      emitData(chunk);
      if (inox::thrown()) return;
    }

    if (backpressured_ && queued_bytes_ < streamHighWaterMark) {
      backpressured_ = false;
      emit("drain");
      if (inox::thrown()) return;
    }

    emitEndIfReady();
  }

  bool hasLivePipe() {
    for (std::size_t index = 0; index < pipes_.size();) {
      if (pipes_[index].expired()) {
        pipes_.erase(pipes_.begin() + static_cast<std::ptrdiff_t>(index));
      } else {
        return true;
      }
    }

    return false;
  }
};

namespace {

void streamListenerAdded(void* context, inox::StringView event_name) {
  if (context == nullptr) return;
  static_cast<Stream::Impl*>(context)->listenerAdded(event_name);
}

} // namespace

namespace {

struct StreamHolder {
  std::shared_ptr<Stream::Impl> impl;
};

inox_status copyStreamHolder(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(StreamHolder), alignof(StreamHolder));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  try {
    *out = new (memory) StreamHolder(*static_cast<const StreamHolder*>(instance));
  } catch (const std::bad_alloc&) {
    allocator->free(allocator->user, memory, sizeof(StreamHolder), alignof(StreamHolder));
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

void destroyStreamHolder(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) return;
  static_cast<StreamHolder*>(instance)->~StreamHolder();
  allocator->free(allocator->user, instance, sizeof(StreamHolder), alignof(StreamHolder));
}

inox_status readStreamField(const void* instance, std::uint32_t index, inox_value* out) {
  (void)instance;
  (void)index;
  (void)out;
  return INOX_ERR_FIELD;
}

void* queryStreamInterface(const void* instance, const void* interface_id) {
  if (instance == nullptr || interface_id != &inox::eventEmitterInterface) return nullptr;
  const std::shared_ptr<Stream::Impl>& impl = static_cast<const StreamHolder*>(instance)->impl;
  return impl ? impl->events().get() : nullptr;
}

const inox_class_descriptor streamDescriptor = {
  "PassThrough",
  0,
  nullptr,
  readStreamField,
  copyStreamHolder,
  destroyStreamHolder,
  queryStreamInterface,
};

PassThrough materializeStream(const std::shared_ptr<Stream::Impl>& impl) {
  if (!impl) return PassThrough();

  const StreamHolder holder = {impl};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &streamDescriptor,
    &holder,
    &value
  );

  if (status == INOX_ERR_OOM) inox::throw_out_of_memory();
  else if (status != INOX_OK) throwStreamError("TypeError: PassThrough materialization failed");

  return status == INOX_OK ? PassThrough(inox::adopt(value)) : PassThrough();
}

std::shared_ptr<Stream::Impl> streamImpl(const Stream& stream) {
  const inox_value raw = stream.raw();

  if (raw.tag != INOX_TAG_CLASS_INSTANCE || raw.as.ref == nullptr) return {};

  const auto* ref = reinterpret_cast<const inox_class_instance_ref*>(raw.as.ref);

  if (ref->descriptor != &streamDescriptor || ref->instance == nullptr) return {};
  return static_cast<const StreamHolder*>(ref->instance)->impl;
}

std::shared_ptr<Stream::Impl> requireStream(const Stream& stream, const char* operation) {
  std::shared_ptr<Stream::Impl> impl = streamImpl(stream);
  if (!impl && !inox::thrown()) throwStreamError(operation);
  return impl;
}

Buffer stringChunk(inox::StringView chunk) {
  return Buffer::from(chunk);
}

Buffer byteChunk(const Uint8Array& chunk) {
  return Buffer::from(chunk);
}

} // namespace

Stream::Stream() : EventEmitter() {}
Stream::Stream(const inox::Value& value) : EventEmitter(value) {}
Stream::Stream(inox::Value&& value) : EventEmitter(std::move(value)) {}

Stream& Stream::destroy() {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.destroy failed");
  if (impl) impl->destroy();
  return *this;
}

bool Stream::destroyed() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.destroyed failed");
  return impl ? impl->destroyed() : true;
}

Stream& Stream::end() { return end(inox::Callback()); }
Stream& Stream::end(inox::Callback callback) {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.end failed");
  if (impl) impl->end(std::move(callback));
  return *this;
}
Stream& Stream::end(inox::StringView chunk) { return end(chunk, inox::Callback()); }
Stream& Stream::end(inox::StringView chunk, inox::Callback callback) {
  const Buffer buffer = stringChunk(chunk);
  if (inox::thrown()) return *this;
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.end failed");
  if (impl) impl->end(buffer, std::move(callback));
  return *this;
}
Stream& Stream::end(const Uint8Array& chunk) { return end(chunk, inox::Callback()); }
Stream& Stream::end(const Uint8Array& chunk, inox::Callback callback) {
  const Buffer buffer = byteChunk(chunk);
  if (inox::thrown()) return *this;
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.end failed");
  if (impl) impl->end(buffer, std::move(callback));
  return *this;
}

bool Stream::isPaused() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.isPaused failed");
  return impl ? impl->isPaused() : true;
}

Stream& Stream::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.on failed");
  if (impl) impl->addListener(event_name, std::move(listener), false);
  return *this;
}

Stream& Stream::once(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.once failed");
  if (impl) impl->addListener(event_name, std::move(listener), true);
  return *this;
}

Stream& Stream::pause() {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.pause failed");
  if (impl) impl->pause();
  return *this;
}

Stream Stream::pipe(Stream destination) {
  std::shared_ptr<Impl> source = requireStream(*this, "TypeError: Stream.pipe failed");
  std::shared_ptr<Impl> target = requireStream(destination, "TypeError: Stream.pipe destination failed");
  if (source && target) source->addPipe(target);
  return destination;
}

bool Stream::readable() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.readable failed");
  return impl ? impl->readable() : false;
}

bool Stream::readableEnded() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.readableEnded failed");
  return impl ? impl->readableEnded() : false;
}

double Stream::readableLength() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.readableLength failed");
  return impl ? impl->readableLength() : 0;
}

Stream& Stream::resume() {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.resume failed");
  if (impl) impl->resume();
  return *this;
}

bool Stream::valid() const { return streamImpl(*this) != nullptr; }

bool Stream::writable() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.writable failed");
  return impl ? impl->writable() : false;
}

bool Stream::writableEnded() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.writableEnded failed");
  return impl ? impl->writableEnded() : false;
}

double Stream::writableLength() const {
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.writableLength failed");
  return impl ? impl->writableLength() : 0;
}

bool Stream::write(inox::StringView chunk) { return write(chunk, inox::Callback()); }
bool Stream::write(inox::StringView chunk, inox::Callback callback) {
  const Buffer buffer = stringChunk(chunk);
  if (inox::thrown()) return false;
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.write failed");
  return impl ? impl->write(buffer, std::move(callback)) : false;
}
bool Stream::write(const Uint8Array& chunk) { return write(chunk, inox::Callback()); }
bool Stream::write(const Uint8Array& chunk, inox::Callback callback) {
  const Buffer buffer = byteChunk(chunk);
  if (inox::thrown()) return false;
  std::shared_ptr<Impl> impl = requireStream(*this, "TypeError: Stream.write failed");
  return impl ? impl->write(buffer, std::move(callback)) : false;
}

Readable::Readable() : Stream() {}
Readable::Readable(const inox::Value& value) : Stream(value) {}
Readable::Readable(inox::Value&& value) : Stream(std::move(value)) {}
Writable::Writable() : Stream() {}
Writable::Writable(const inox::Value& value) : Stream(value) {}
Writable::Writable(inox::Value&& value) : Stream(std::move(value)) {}
Duplex::Duplex() : Readable() {}
Duplex::Duplex(const inox::Value& value) : Readable(value) {}
Duplex::Duplex(inox::Value&& value) : Readable(std::move(value)) {}
Transform::Transform() : Duplex() {}
Transform::Transform(const inox::Value& value) : Duplex(value) {}
Transform::Transform(inox::Value&& value) : Duplex(std::move(value)) {}
PassThrough::PassThrough() : Transform() {}
PassThrough::PassThrough(const inox::Value& value) : Transform(value) {}
PassThrough::PassThrough(inox::Value&& value) : Transform(std::move(value)) {}

PassThrough PassThrough::create() {
  try {
    return materializeStream(std::make_shared<Stream::Impl>());
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return PassThrough();
  }
}
