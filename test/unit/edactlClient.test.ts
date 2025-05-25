import { expect } from '../helpers/setup';
import sinon from 'sinon';
import type { KubernetesClient } from '../../src/clients/kubernetesClient';
import { installVsCodeMock } from '../helpers/vscodeMock';

// The VS Code API is not available when running the tests in Node. Install a
// stub using jest-mock-vscode so that modules depending on `vscode` can load.
let EdactlClient: typeof import('../../src/clients/edactlClient').EdactlClient;
before(() => {
  const { restore } = installVsCodeMock();
  EdactlClient = require('../../src/clients/edactlClient').EdactlClient;
  restore();
});

/**
 * Tests for EdactlClient.getEdaTransactions which parses the output of the
 * `edactl transaction` command. The command execution is stubbed so the parser
 * can be verified independently of any real system interaction.
 */
describe('EdactlClient.getEdaTransactions', () => {
  it('parses table output into transaction objects', async () => {
    const dummyK8sClient = {} as unknown as KubernetesClient;
    const client = new EdactlClient(dummyK8sClient);
    const header = 'ID    Result    Age    Detail    DryRun    Username    Description';
    const line1 = '1     OK        5m     SOME      -         user1       Created resource';
    const line2 = '2     FAIL      10m    SOME      false     user2       Failure because';
    const stub = sinon
      .stub(client as any, 'executeEdactl')
      .resolves(`${header}\n${line1}\n${line2}\n`);

    const transactions = await client.getEdaTransactions();

    expect(stub.calledOnceWithExactly('transaction')).to.be.true;
    expect(transactions).to.deep.equal([
      {
        id: '1',
        result: 'OK',
        age: '5m',
        detail: 'SOME',
        dryRun: '-',
        username: 'user1',
        description: 'Created resource'
      },
      {
        id: '2',
        result: 'FAIL',
        age: '10m',
        detail: 'SOME',
        dryRun: 'false',
        username: 'user2',
        description: 'Failure because'
      }
    ]);
  });
});
