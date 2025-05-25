/**
 * Unit tests for the resource document providers.
 *
 * These tests verify the helper URI functions, change detection logic and the
 * read-only enforcement of the view provider.
 *
 * Expectations:
 * - `parseUri` should inverse `createUri` for both providers.
 * - `hasChanges` returns `true` only when the YAML content differs from the
 *   stored original resource.
 * - `writeFile` on the view provider throws `vscode.FileSystemError.NoPermissions`.
 */
import { expect } from '../helpers/setup';
import * as yaml from 'js-yaml';
import { installVsCodeMock } from '../helpers/vscodeMock';

let ResourceEditDocumentProvider: typeof import('../../src/providers/documents/resourceEditProvider').ResourceEditDocumentProvider;
let ResourceViewDocumentProvider: typeof import('../../src/providers/documents/resourceViewProvider').ResourceViewDocumentProvider;
let vscode: typeof import('vscode');

before(() => {
  const { restore, vscode: vscodeMock } = installVsCodeMock();
  vscode = vscodeMock as unknown as typeof import('vscode');
  delete require.cache[require.resolve('../../src/providers/documents/resourceEditProvider')];
  delete require.cache[require.resolve('../../src/providers/documents/resourceViewProvider')];
  ResourceEditDocumentProvider = require('../../src/providers/documents/resourceEditProvider').ResourceEditDocumentProvider;
  ResourceViewDocumentProvider = require('../../src/providers/documents/resourceViewProvider').ResourceViewDocumentProvider;
  restore();
});

describe('Resource Document Providers', () => {
  // `createUri` should produce a URI that `parseUri` can decode back to the
  // original components for the edit provider.
  it('parseUri and createUri for ResourceEditDocumentProvider', () => {
    const uri = ResourceEditDocumentProvider.createUri('ns', 'Pod', 'foo');
    expect(uri.toString()).to.equal('k8s:/ns/Pod/foo');
    const parsed = ResourceEditDocumentProvider.parseUri(uri);
    expect(parsed).to.deep.equal({ namespace: 'ns', kind: 'Pod', name: 'foo' });
  });

  // `createUri` and `parseUri` must work together for the view provider as
  // well, using the read-only scheme.
  it('parseUri and createUri for ResourceViewDocumentProvider', () => {
    const uri = ResourceViewDocumentProvider.createUri('ns', 'Pod', 'foo');
    expect(uri.toString()).to.equal('k8s-view:/ns/Pod/foo');
    const parsed = ResourceViewDocumentProvider.parseUri(uri);
    expect(parsed).to.deep.equal({ namespace: 'ns', kind: 'Pod', name: 'foo' });
  });

  // `hasChanges` should compare the in-memory YAML with the stored original and
  // report when modifications have been made.
  it('hasChanges detects modifications', async () => {
    const provider = new ResourceEditDocumentProvider();
    const uri = ResourceEditDocumentProvider.createUri('ns', 'Pod', 'foo');
    const original = { metadata: { name: 'foo', namespace: 'ns' }, spec: { replicas: 1 } };
    provider.setOriginalResource(uri, original);
    provider.setResourceContent(uri, yaml.dump(original));

    const unchanged = await provider.hasChanges(uri);
    expect(unchanged).to.be.false;

    const modified = { metadata: { name: 'foo', namespace: 'ns' }, spec: { replicas: 2 } };
    provider.setResourceContent(uri, yaml.dump(modified));
    const changed = await provider.hasChanges(uri);
    expect(changed).to.be.true;
  });

  // The view provider is read-only, so attempting to write should fail with a
  // `NoPermissions` error from VS Code.
  it('writeFile of ResourceViewDocumentProvider throws NoPermissions', () => {
    const provider = new ResourceViewDocumentProvider();
    const uri = ResourceViewDocumentProvider.createUri('ns', 'Pod', 'foo');
    const buffer = Buffer.from('test');
    expect(() => provider.writeFile(uri, buffer, { create: true, overwrite: true })).to.throw(vscode.FileSystemError.NoPermissions().message);
  });
});
