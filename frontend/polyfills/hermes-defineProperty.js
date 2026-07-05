// Hermes/RN 0.85 polyfill: Event phase constants (NONE, CAPTURING_PHASE, etc.)
// are defined without configurable:true in react-native/src/private/webapis/dom/events/Event.js
// This breaks event-target-shim (used by abort-controller/fetch) when _interopNamespace
// tries to copy/redefine these properties. We wrap Object.defineProperty to silently
// upgrade non-configurable props to configurable before redefining.
const _origDefineProperty = Object.defineProperty;
Object.defineProperty = function (obj, prop, descriptor) {
  try {
    return _origDefineProperty(obj, prop, descriptor);
  } catch (_e) {
    try {
      const existing = Object.getOwnPropertyDescriptor(obj, prop);
      if (existing && !existing.configurable) {
        _origDefineProperty(obj, prop, { ...existing, configurable: true });
      }
      return _origDefineProperty(obj, prop, descriptor);
    } catch (_e2) {
      return obj;
    }
  }
};
