import sinon from 'sinon';

/**
 * Replace the `child_process.execSync` function with a stub.
 * Returns a function that restores the original implementation.
 */
export function installExecSyncMock(execStub: sinon.SinonStub) {
  const cp = require('child_process') as typeof import('child_process');
  const original = cp.execSync;
  cp.execSync = execStub as any;

  return () => {
    cp.execSync = original;
  };
}
