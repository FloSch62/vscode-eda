import { expect } from '../helpers/setup';
import sinon from 'sinon';
import { installVsCodeMock } from '../helpers/vscodeMock';

/**
 * Unit tests for `EdactlClient.getEdaAlarms`.
 *
 * The function should resolve with an empty array when the internal
 * `executeEdactl` promise does not complete within the 20s timeout.
 * The kubectl utilities are stubbed so no real commands are executed.
 */

describe('EdactlClient.getEdaAlarms', () => {
  let EdactlClient: typeof import('../../src/clients/edactlClient').EdactlClient;
  let runKubectlStub: sinon.SinonStub;

  before(() => {
    const { restore } = installVsCodeMock();
    const krPath = '../../src/utils/kubectlRunner';
    delete require.cache[require.resolve(krPath)];
    const kubectlRunner = require(krPath);
    runKubectlStub = sinon.stub(kubectlRunner, 'runKubectl').returns('toolbox-pod');
    delete require.cache[require.resolve('../../src/clients/edactlClient')];
    EdactlClient = require('../../src/clients/edactlClient').EdactlClient;
    restore();
  });

  after(() => {
    runKubectlStub.restore();
  });

  it('returns empty array on timeout', async () => {
    const clock = sinon.useFakeTimers();
    const client = new EdactlClient({} as any);
    sinon.stub(client as any, 'executeEdactl').returns(new Promise(() => {}));

    const resultPromise = client.getEdaAlarms();
    await clock.tickAsync(20001);
    const result = await resultPromise;
    expect(result).to.deep.equal([]);
    clock.restore();
  });
});
