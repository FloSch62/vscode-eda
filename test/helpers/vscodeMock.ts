import { createVSCodeMock } from 'jest-mock-vscode';
import sinon from 'sinon';
import Module from 'module';

/**
 * Simple adapter so jest-mock-vscode can work with sinon based tests.
 */
const sinonFramework = {
  fn: (impl?: Function) => {
    const stub = sinon.stub();
    if (impl) {
      stub.callsFake(impl as any);
    }
    return stub;
  },
};

/**
 * Installs a VS Code API mock and stub extension module so modules depending on
 * them can load in a plain Node environment. Returns the mock object and a
 * function to restore the original module loader.
 */
export function installVsCodeMock() {
  const vscode = createVSCodeMock(sinonFramework as any);
  const originalRequire = (Module as any).prototype.require;

  (Module as any).prototype.require = function (request: string) {
    if (request === 'vscode') {
      return vscode;
    }
    if (request.includes('extension')) {
      return { LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }, log: () => {} };
    }
    return originalRequire.apply(this, arguments as any);
  };

  return {
    vscode,
    restore: () => {
      (Module as any).prototype.require = originalRequire;
    },
  };
}
