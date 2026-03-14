/**
 * Manual Jest mock for react-native-mmkv.
 * Placed at <root>/__mocks__/ so Jest picks it up automatically for node_modules.
 * Each call to createMMKV returns a fresh mock instance with a shared in-memory store
 * so that storage reads and writes within the same test are consistent.
 */
const createStorageInstance = () => {
  const store = new Map();
  return {
    getString: jest.fn((key) => store.get(key)),
    set: jest.fn((key, value) => { store.set(key, value); }),
    delete: jest.fn((key) => { store.delete(key); }),
    contains: jest.fn((key) => store.has(key)),
    clearAll: jest.fn(() => { store.clear(); }),
    getAllKeys: jest.fn(() => Array.from(store.keys())),
  };
};

module.exports = {
  createMMKV: jest.fn(() => createStorageInstance()),
  MMKV: jest.fn().mockImplementation(() => createStorageInstance()),
};
