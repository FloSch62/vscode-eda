import { expect } from 'chai';
import sinon from 'sinon';
import { KubeConfig } from '@kubernetes/client-node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('KubeConfig initialization', () => {
  let kubeconfigPath: string;

  beforeEach(() => {
    const kubeconfig = `apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://localhost
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user
current-context: test-context
users:
- name: test-user
  user:
    token: dummy-token
`;
    kubeconfigPath = path.join(os.tmpdir(), 'test-kubeconfig.yaml');
    fs.writeFileSync(kubeconfigPath, kubeconfig);
    process.env.KUBECONFIG = kubeconfigPath;
  });

  afterEach(() => {
    if (fs.existsSync(kubeconfigPath)) {
      fs.unlinkSync(kubeconfigPath);
    }
    delete process.env.KUBECONFIG;
  });

  it('loads the correct user from default kubeconfig', () => {
    const loadSpy = sinon.spy(KubeConfig.prototype, 'loadFromDefault');

    const kc = new KubeConfig();
    kc.loadFromDefault();

    sinon.assert.calledOnce(loadSpy);

    const user = kc.getCurrentUser();
    expect(user).to.not.be.null;
    expect(user!.name).to.equal('test-user');
    expect(user!.name).to.not.equal('system:anonymous');

    loadSpy.restore();
  });
});
