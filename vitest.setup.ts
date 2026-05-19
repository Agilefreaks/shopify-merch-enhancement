import "@testing-library/jest-dom/vitest";

// Stub App Bridge globals
Object.defineProperty(globalThis, "shopify", {
  value: {
    toast: { show: () => {} },
    resourcePicker: () => Promise.resolve([]),
  },
  writable: true,
});
