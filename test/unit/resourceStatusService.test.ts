/**
 * Unit tests for the ResourceStatusService.
 *
 * These tests verify how different Kubernetes resource states and alarm
 * severities are converted into status indicator colors. The service is
 * instantiated with a minimal stubbed KubernetesClient that provides a CRD with
 * a `status` section so custom resource logic can execute.
 *
 * - `getResourceStatusIndicator` should return the expected color for Pod
 *   phases, Deployment readiness, and a custom resource's `state` field.
 * - `getAlarmStatusIndicator` should map alarm severities to the correct color
 *   indicators.
 */
import { expect } from '../helpers/setup';
import sinon from 'sinon';
import { installVsCodeMock } from '../helpers/vscodeMock';
import type { KubernetesClient } from '../../src/clients/kubernetesClient';

let ResourceStatusService: typeof import('../../src/services/resourceStatusService').ResourceStatusService;

before(() => {
  const { restore } = installVsCodeMock();
  ResourceStatusService = require('../../src/services/resourceStatusService').ResourceStatusService;
  restore();
});

describe('ResourceStatusService', () => {
  function createService(): InstanceType<typeof ResourceStatusService> {
    const k8sClient = {
      getCachedCrds: sinon.stub().returns([
        {
          spec: {
            names: { kind: 'MyKind' },
            versions: [
              {
                storage: true,
                schema: { openAPIV3Schema: { properties: { status: {} } } }
              }
            ]
          }
        }
      ])
    } as unknown as KubernetesClient;
    return new ResourceStatusService(k8sClient);
  }

  describe('getResourceStatusIndicator', () => {
    it('handles Pod phases', () => {
      const svc = createService();
      const pod: any = { kind: 'Pod', status: { phase: 'Running' } };
      expect(svc.getResourceStatusIndicator(pod)).to.equal('green');
      pod.status.phase = 'Pending';
      expect(svc.getResourceStatusIndicator(pod)).to.equal('yellow');
      pod.status.phase = 'Failed';
      expect(svc.getResourceStatusIndicator(pod)).to.equal('red');
    });

    it('handles Deployment readiness', () => {
      const svc = createService();
      const dep: any = {
        kind: 'Deployment',
        spec: { replicas: 3 },
        status: { readyReplicas: 3 }
      };
      expect(svc.getResourceStatusIndicator(dep)).to.equal('green');
      dep.status.readyReplicas = 1;
      expect(svc.getResourceStatusIndicator(dep)).to.equal('yellow');
      dep.status.readyReplicas = 0;
      expect(svc.getResourceStatusIndicator(dep)).to.equal('red');
      dep.spec.replicas = 0;
      expect(svc.getResourceStatusIndicator(dep)).to.equal('gray');
    });

    it('handles custom resource states', () => {
      const svc = createService();
      const res: any = { kind: 'MyKind', status: { state: 'Ready' } };
      expect(svc.getResourceStatusIndicator(res)).to.equal('green');
      res.status.state = 'Failed';
      expect(svc.getResourceStatusIndicator(res)).to.equal('red');
      res.status.state = 'Pending';
      expect(svc.getResourceStatusIndicator(res)).to.equal('yellow');
    });
  });

  describe('getAlarmStatusIndicator', () => {
    it('maps severities to colors', () => {
      const svc = createService();
      expect(svc.getAlarmStatusIndicator('CRITICAL')).to.equal('red');
      expect(svc.getAlarmStatusIndicator('MAJOR')).to.equal('yellow');
      expect(svc.getAlarmStatusIndicator('WARNING')).to.equal('yellow');
      expect(svc.getAlarmStatusIndicator('MINOR')).to.equal('gray');
      expect(svc.getAlarmStatusIndicator('INFO')).to.equal('green');
      expect(svc.getAlarmStatusIndicator('UNKNOWN')).to.equal('gray');
    });
  });
});
