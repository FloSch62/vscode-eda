import * as kubernetes from '@kubernetes/client-node';
import * as path from 'path';

export async function loadKubeconfig(): Promise<kubernetes.KubeConfig> {
    const kc = new kubernetes.KubeConfig();

    try {
        kc.loadFromDefault();
        const currentContext = kc.getCurrentContext();
        if (!currentContext) {
            throw new Error('No current context found in kubeconfig');
        }
        return kc;
    } catch (error) {
        const kubeconfigPath = process.env.KUBECONFIG || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.kube', 'config');
        kc.loadFromFile(kubeconfigPath);
        return kc;
    }
}
