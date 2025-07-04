import { expect } from 'chai';
import sinon from 'sinon';
// Use CommonJS require to obtain a mutable module object for stubbing
import undici = require('undici');
import { EdaApiClient } from '../src/clients/edaApiClient';
import type { EdaAuthClient } from '../src/clients/edaAuthClient';
import * as extension from '../src/extension';

/** Helper to create a mock fetch response */
function mockResponse(status: number, body: any) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as any);
}

describe('EdaApiClient token refresh', () => {
  let fetchStub: sinon.SinonStub;
  let authClient: EdaAuthClient;
  let logStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(undici, 'fetch');
    logStub = sinon.stub(extension, 'log');
    authClient = {
      getBaseUrl: () => 'http://api',
      getHeaders: () => ({ Authorization: 'Bearer token' }),
      getAgent: () => undefined,
      waitForAuth: sinon.stub().resolves(),
      refreshAuth: sinon.stub().resolves(),
      onTokenRefreshed: sinon.stub(),
      offTokenRefreshed: sinon.stub(),
      isTokenExpiredResponse: (status: number, body: string) => status === 401 && body.includes('Access token has expired'),
    } as unknown as EdaAuthClient;
  });

  afterEach(() => {
    fetchStub.restore();
    logStub.restore();
  });

  it('retries the request after refreshing the token', async () => {
    fetchStub
      .onFirstCall()
      .returns(mockResponse(401, { message: 'Access token has expired' }))
      .onSecondCall()
      .returns(mockResponse(200, { foo: 'bar' }));

    const client = new EdaApiClient(authClient);
    const result = await client.requestJSON('GET', '/foo');

    expect(result).to.deep.equal({ foo: 'bar' });
    expect((authClient.refreshAuth as sinon.SinonStub).called).to.be.true;
    expect(fetchStub.calledTwice).to.be.true;
  });

  it('fetches EQL autocomplete results', async () => {
    fetchStub.returns(
      mockResponse(200, { completions: [{ token: 'foo', completion: 'oo' }] })
    );

    const client = new EdaApiClient(authClient);
    const result = await client.autocompleteEql('f', 20);

    expect(result).to.deep.equal(['foo']);
    expect(fetchStub.calledOnce).to.be.true;
  });

  it('fetches transaction details using v2 endpoints', async () => {
    const specManager = {
      getPathByOperationId: sinon.stub()
    } as any;
    specManager.getPathByOperationId.withArgs('transGetSummaryResult').resolves('/core/transaction/v2/result/summary/{transactionId}');
    specManager.getPathByOperationId.withArgs('transGetResultExecution').resolves('/core/transaction/v2/result/execution/{transactionId}');
    specManager.getPathByOperationId.withArgs('transGetResultInputResources').resolves('/core/transaction/v2/result/inputresources/{transactionId}');

    fetchStub
      .onCall(0)
      .returns(mockResponse(200, { id: 1, state: 'complete' }))
      .onCall(1)
      .returns(mockResponse(200, { changedCrs: [] }))
      .onCall(2)
      .returns(mockResponse(200, { inputCrs: [] }));

    const client = new EdaApiClient(authClient);
    client.setSpecManager(specManager);
    const result = await client.getTransactionDetails(1);

    expect(fetchStub.callCount).to.equal(3);
    expect(result).to.deep.equal({ id: 1, state: 'complete', changedCrs: [], inputCrs: [] });
  });
});
