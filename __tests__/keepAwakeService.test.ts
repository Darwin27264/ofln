import { TurboModuleRegistry } from 'react-native';
import {
  __resetKeepAwakeCacheForTests,
  activateGeneratingKeepAwake,
  deactivateGeneratingKeepAwake,
  isKeepAwakeAvailable,
} from '../src/services/keepAwakeService';

describe('keepAwakeService', () => {
  const activate = jest.fn();
  const deactivate = jest.fn();

  beforeEach(() => {
    __resetKeepAwakeCacheForTests();
    activate.mockClear();
    deactivate.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetKeepAwakeCacheForTests();
  });

  it('reports unavailable and no-ops when native module is missing', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
    expect(isKeepAwakeAvailable()).toBe(false);
    expect(() => activateGeneratingKeepAwake()).not.toThrow();
    expect(() => deactivateGeneratingKeepAwake()).not.toThrow();
  });

  it('activates and deactivates when the TurboModule is linked', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name) => {
      if (name === 'ReactNativeKCKeepAwake') {
        return { activate, deactivate } as any;
      }
      return null;
    });
    expect(isKeepAwakeAvailable()).toBe(true);
    activateGeneratingKeepAwake();
    deactivateGeneratingKeepAwake();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
  });
});
