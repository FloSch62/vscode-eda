import { expect } from '../helpers/setup';
import sinon from 'sinon';
import path from 'path';
import { installVsCodeMock } from '../helpers/vscodeMock';

describe('loadTemplate', () => {
  let loadTemplate: typeof import('../../src/utils/templateLoader').loadTemplate;

  before(() => {
    const { restore } = installVsCodeMock();
    delete require.cache[require.resolve('../../src/utils/templateLoader')];
    loadTemplate = require('../../src/utils/templateLoader').loadTemplate;
    restore();
  });

  it('injects variables correctly', () => {
    const templatePath = path.join(__dirname, 'templates', 'hello.hbs'); // eslint-disable-line no-undef
    const context = { asAbsolutePath: sinon.stub().returns(templatePath) } as any;

    const result = loadTemplate('hello', context, { name: 'Test', value: 42 });
    expect(result.trim()).to.equal('Hello Test, value: 42');
  });

  it('returns an error string when the template does not exist', () => {
    const context = { asAbsolutePath: sinon.stub().returns('missing.hbs') } as any;
    const errorStub = sinon.stub(console, 'error');
    const result = loadTemplate('missing', context, {});
    expect(result).to.include('Error loading template missing');
    expect(errorStub.called).to.be.true;
    errorStub.restore();
  });
});
