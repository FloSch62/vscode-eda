import { expect } from '../helpers/setup';
import sinon from 'sinon';
import { installVsCodeMock } from '../helpers/vscodeMock';

/**
 * Unit tests for namespace related helpers in `EdactlClient`.
 *
 * - verifies that `findToolboxPod` caches the toolbox pod name so
 *   subsequent calls do not invoke `runKubectl` again.
 * - ensures `getEdaNamespaces` returns an empty array when the toolbox
 *   pod reports "No resources found".
 */

describe('EdactlClient namespaces', () => {
  let EdactlClient: typeof import('../../src/clients/edactlClient').EdactlClient;
  let runKubectlStub: sinon.SinonStub;
  let execInPodStub: sinon.SinonStub;

  before(() => {
    const { restore } = installVsCodeMock();
    const krPath = '../../src/utils/kubectlRunner';
    delete require.cache[require.resolve(krPath)];
    const kubectlRunner = require(krPath);
    runKubectlStub = sinon.stub(kubectlRunner, 'runKubectl').returns('toolbox-pod');
    execInPodStub = sinon.stub(kubectlRunner, 'execInPod').returns('');
    delete require.cache[require.resolve('../../src/clients/edactlClient')];
    EdactlClient = require('../../src/clients/edactlClient').EdactlClient;
    restore();
  });

  after(() => {
    runKubectlStub.restore();
    execInPodStub.restore();
  });

  it('returns cached pod name on subsequent calls', async () => {
    const client = new EdactlClient({} as any);
    const pod1 = await (client as any).findToolboxPod();
    const pod2 = await (client as any).findToolboxPod();
    expect(pod1).to.equal('toolbox-pod');
    expect(pod2).to.equal('toolbox-pod');
    expect(runKubectlStub.calledOnce).to.be.true;
  });

  it('returns empty array when no namespaces are found', async () => {
    runKubectlStub.reset();
    execInPodStub.reset();
    runKubectlStub.returns('tb-pod');
    execInPodStub.returns('No resources found');

    const client = new EdactlClient({} as any);
    const namespaces = await client.getEdaNamespaces();
    expect(namespaces).to.deep.equal([]);
    expect(execInPodStub.calledOnce).to.be.true;
  });
});
