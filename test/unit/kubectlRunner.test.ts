import { expect } from '../helpers/setup';
import sinon from 'sinon';
import { installVsCodeMock } from '../helpers/vscodeMock';
import childProcess from 'child_process';

// We'll mock VS Code and child_process before importing the module under test.
let execStub: sinon.SinonStub;
let runKubectl: typeof import('../../src/utils/kubectlRunner').runKubectl;
before(() => {
  execStub = sinon.stub(childProcess, 'execSync').returns('ok');
  const { restore: restoreVSCode } = installVsCodeMock();
  delete require.cache[require.resolve('../../src/utils/kubectlRunner')];
  runKubectl = require('../../src/utils/kubectlRunner').runKubectl;
  restoreVSCode();
});

after(() => {
  execStub.restore();
});

/**
 * Unit tests for the runKubectl utility function.
 *
 * The function builds the kubectl command line and executes it using execSync.
 * These tests stub execSync so no real commands are run and verify that the
 * command string and options are composed correctly.
 */
describe('runKubectl', () => {

  it('adds namespace and json output flags', () => {
    execStub.reset();
    execStub.returns('ok');
    const result = runKubectl('kubectl', ['get', 'pods'], {
      namespace: 'test-ns',
      jsonOutput: true
    });

    expect(execStub.calledOnce).to.be.true;
    const [cmd] = execStub.firstCall.args;
    expect(cmd).to.equal('kubectl --namespace test-ns get pods -o json');
    const options = execStub.firstCall.args[1] as any;
    expect(options.encoding).to.equal('utf-8');
    expect(options.timeout).to.equal(30000);
    expect(result).to.equal('ok');
  });

  it('returns stdout when command fails but ignoreErrors is set', () => {
    execStub.reset();
    execStub.throws({ stdout: 'err' });

    const out = runKubectl('kubectl', ['get', 'pods'], { ignoreErrors: true });
    expect(out).to.equal('err');
  });
});
