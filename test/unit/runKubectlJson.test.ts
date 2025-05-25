import { expect } from '../helpers/setup';
import sinon from 'sinon';
import childProcess from 'child_process';
import { installVsCodeMock } from '../helpers/vscodeMock';

describe('runKubectlJson', () => {
  let execStub: sinon.SinonStub;
  let runKubectlJson: typeof import('../../src/utils/kubectlRunner').runKubectlJson;

  before(() => {
    execStub = childProcess.execSync as unknown as sinon.SinonStub;
    const { restore: restoreVSCode } = installVsCodeMock();
    delete require.cache[require.resolve('../../src/utils/kubectlRunner')];
    runKubectlJson = require('../../src/utils/kubectlRunner').runKubectlJson;
    restoreVSCode();
  });

  it('parses JSON output and passes jsonOutput flag', () => {
    execStub.reset();
    execStub.returns('{"foo":"bar"}');

    const result = runKubectlJson<{ foo: string }>('kubectl', ['get', 'pod'], {
      namespace: 'ns'
    });

    expect(execStub.calledOnce).to.be.true;
    const [cmd] = execStub.firstCall.args;
    expect(cmd).to.equal('kubectl --namespace ns get pod -o json');
    expect(result).to.deep.equal({ foo: 'bar' });
  });
});
