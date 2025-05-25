import { expect } from '../helpers/setup';
import sinon from 'sinon';
import { installVsCodeMock } from '../helpers/vscodeMock';

/**
 * Unit tests for `EdactlClient.getEdaResourceYaml`.
 *
 * When `edactl` prints an error message the function should detect it and
 * return an empty string so the caller can fall back to `kubectl`.
 */

describe('EdactlClient.getEdaResourceYaml', () => {
  let EdactlClient: typeof import('../../src/clients/edactlClient').EdactlClient;
  let runKubectlStub: sinon.SinonStub;
  let execInPodStub: sinon.SinonStub;

  before(() => {
    const { restore } = installVsCodeMock();
    const krPath = '../../src/utils/kubectlRunner';
    delete require.cache[require.resolve(krPath)];
    const kubectlRunner = require(krPath);
    runKubectlStub = sinon.stub(kubectlRunner, 'runKubectl').returns('pod');
    execInPodStub = sinon.stub(kubectlRunner, 'execInPod').returns('Error: NotFound');
    delete require.cache[require.resolve('../../src/clients/edactlClient')];
    EdactlClient = require('../../src/clients/edactlClient').EdactlClient;
    restore();
  });

  after(() => {
    runKubectlStub.restore();
    execInPodStub.restore();
  });

  it('returns empty string when edactl output contains errors', async () => {
    const client = new EdactlClient({} as any);
    const yaml = await client.getEdaResourceYaml('Deviation', 'foo', 'ns1');
    expect(yaml).to.equal('');
    expect(execInPodStub.calledOnce).to.be.true;
  });
});
