import * as vscode from 'vscode';
import { log, LogLevel } from '../extension';
import { runKubectl, runKubectlJson, KubectlOptions } from '../utils/kubectlRunner';
import { EdactlClient } from './edactlClient';
import { KubectlWatcher } from '../utils/kubectlWatcher';

export type KubernetesObject = any;

export class KubernetesClient {
  private kubectlPath = 'kubectl';

  private _onResourceChanged = new vscode.EventEmitter<void>();
  readonly onResourceChanged = this._onResourceChanged.event;
  private _onDeviationChanged = new vscode.EventEmitter<void>();
  readonly onDeviationChanged = this._onDeviationChanged.event;
  private _onTransactionChanged = new vscode.EventEmitter<void>();
  readonly onTransactionChanged = this._onTransactionChanged.event;

  private crdWatcher?: KubectlWatcher;
  private crdsCache: any[] = [];

  private namespaceWatcher?: KubectlWatcher;
  private namespacesCache: any[] = [];

  private pvWatcher?: KubectlWatcher;
  private pvsCache: any[] = [];

  private podWatchers: Map<string, KubectlWatcher> = new Map();
  private podsCache: Map<string, KubernetesObject[]> = new Map();
  private serviceWatchers: Map<string, KubectlWatcher> = new Map();
  private servicesCache: Map<string, KubernetesObject[]> = new Map();
  private configMapWatchers: Map<string, KubectlWatcher> = new Map();
  private configMapsCache: Map<string, KubernetesObject[]> = new Map();
  private secretWatchers: Map<string, KubectlWatcher> = new Map();
  private secretsCache: Map<string, KubernetesObject[]> = new Map();
  private pvcWatchers: Map<string, KubectlWatcher> = new Map();
  private pvcsCache: Map<string, KubernetesObject[]> = new Map();
  private endpointsWatchers: Map<string, KubectlWatcher> = new Map();
  private endpointsCache: Map<string, KubernetesObject[]> = new Map();
  private deploymentWatchers: Map<string, KubectlWatcher> = new Map();
  private deploymentsCache: Map<string, KubernetesObject[]> = new Map();
  private replicaSetWatchers: Map<string, KubectlWatcher> = new Map();
  private replicaSetsCache: Map<string, KubernetesObject[]> = new Map();
  private statefulSetWatchers: Map<string, KubectlWatcher> = new Map();
  private statefulSetsCache: Map<string, KubernetesObject[]> = new Map();
  private daemonSetWatchers: Map<string, KubectlWatcher> = new Map();
  private daemonSetsCache: Map<string, KubernetesObject[]> = new Map();
  private jobWatchers: Map<string, KubectlWatcher> = new Map();
  private jobsCache: Map<string, KubernetesObject[]> = new Map();
  private cronJobWatchers: Map<string, KubectlWatcher> = new Map();
  private cronJobsCache: Map<string, KubernetesObject[]> = new Map();
  private ingressWatchers: Map<string, KubectlWatcher> = new Map();
  private ingressesCache: Map<string, KubernetesObject[]> = new Map();

  private resourceWatchers: Map<string, KubectlWatcher> = new Map();
  private resourceCache: Map<string, KubernetesObject[]> = new Map();

  private edaNamespaces: string[] = [];
  private edactlClient?: EdactlClient;

  private resourceChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private resourceChangesPending = false;

  constructor() {
    log('Initialized KubernetesClient', LogLevel.DEBUG);
  }

  public getCurrentContext(): string {
    try {
      const output = runKubectl(this.kubectlPath, ['config', 'current-context']);
      return output.trim() || 'none';
    } catch {
      return 'none';
    }
  }

  public getAvailableContexts(): string[] {
    try {
      const output = runKubectl(this.kubectlPath, ['config', 'get-contexts', '-o', 'name']);
      return output.split('\n').map(c => c.trim()).filter(c => c.length > 0);
    } catch {
      return [];
    }
  }

  public async switchContext(contextName: string): Promise<void> {
    log(`Switching context to ${contextName}`, LogLevel.INFO, true);
    runKubectl(this.kubectlPath, ['config', 'use-context', contextName]);
    this.stopAllWatchers();
    this.clearAllCaches();
    await this.startWatchers();
    log(`Switched context to ${contextName}`, LogLevel.INFO);
  }

  public setEdactlClient(client: EdactlClient) {
    this.edactlClient = client;
  }

  public async startWatchers(): Promise<void> {
    await this.startCrdWatcher();
    await this.startNamespaceWatcher();
    await this.startPersistentVolumeWatcher();
    if (this.edactlClient) {
      await this.refreshEdaNamespaces();
    }
  }

  private async startCrdWatcher(): Promise<void> {
    if (this.crdWatcher) this.crdWatcher.stop();
    this.crdWatcher = new KubectlWatcher(this.kubectlPath, ['get', 'crd']);
    this.crdWatcher.on('add', obj => {
      if (!this.crdsCache.find(o => o.metadata?.name === obj.metadata?.name)) {
        this.crdsCache.push(obj);
        this.startResourceWatcher(obj).catch(err => log(`Error starting watcher: ${err}`, LogLevel.ERROR));
      }
    });
    this.crdWatcher.on('update', obj => {
      const idx = this.crdsCache.findIndex(o => o.metadata?.name === obj.metadata?.name);
      if (idx >= 0) this.crdsCache[idx] = obj; else this.crdsCache.push(obj);
      this.startResourceWatcher(obj).catch(err => log(`Error starting watcher: ${err}`, LogLevel.ERROR));
    });
    this.crdWatcher.on('delete', obj => {
      this.crdsCache = this.crdsCache.filter(o => o.metadata?.name !== obj.metadata?.name);
    });
    this.crdWatcher.on('error', err => {
      log(`CRD watcher error: ${err}`, LogLevel.ERROR);
      setTimeout(() => this.startCrdWatcher(), 5000);
    });
    this.crdWatcher.start();
  }

  private async startNamespaceWatcher(): Promise<void> {
    if (this.namespaceWatcher) this.namespaceWatcher.stop();
    this.namespaceWatcher = new KubectlWatcher(this.kubectlPath, ['get', 'namespaces']);
    this.namespaceWatcher.on('add', async obj => {
      if (!this.namespacesCache.find(o => o.metadata?.name === obj.metadata?.name)) {
        this.namespacesCache.push(obj);
      }
      if (this.edactlClient) await this.refreshEdaNamespaces();
      this.debouncedFireResourceChanged();
    });
    this.namespaceWatcher.on('update', async obj => {
      const idx = this.namespacesCache.findIndex(o => o.metadata?.name === obj.metadata?.name);
      if (idx >= 0) this.namespacesCache[idx] = obj; else this.namespacesCache.push(obj);
      if (this.edactlClient) await this.refreshEdaNamespaces();
      this.debouncedFireResourceChanged();
    });
    this.namespaceWatcher.on('delete', async obj => {
      this.namespacesCache = this.namespacesCache.filter(o => o.metadata?.name !== obj.metadata?.name);
      if (this.edactlClient) await this.refreshEdaNamespaces();
      this.debouncedFireResourceChanged();
    });
    this.namespaceWatcher.on('error', err => {
      log(`Namespace watcher error: ${err}`, LogLevel.ERROR);
      setTimeout(() => this.startNamespaceWatcher(), 5000);
    });
    this.namespaceWatcher.start();
  }

  private async startPersistentVolumeWatcher(): Promise<void> {
    if (this.pvWatcher) this.pvWatcher.stop();
    this.pvWatcher = new KubectlWatcher(this.kubectlPath, ['get', 'persistentvolumes']);
    this.pvWatcher.on('add', obj => {
      if (!this.pvsCache.find(o => o.metadata?.uid === obj.metadata?.uid)) {
        this.pvsCache.push(obj);
      }
      this.debouncedFireResourceChanged();
    });
    this.pvWatcher.on('update', obj => {
      const idx = this.pvsCache.findIndex(o => o.metadata?.uid === obj.metadata?.uid);
      if (idx >= 0) this.pvsCache[idx] = obj; else this.pvsCache.push(obj);
      this.debouncedFireResourceChanged();
    });
    this.pvWatcher.on('delete', obj => {
      this.pvsCache = this.pvsCache.filter(o => o.metadata?.uid !== obj.metadata?.uid);
      this.debouncedFireResourceChanged();
    });
    this.pvWatcher.on('error', err => {
      log(`PV watcher error: ${err}`, LogLevel.ERROR);
      setTimeout(() => this.startPersistentVolumeWatcher(), 5000);
    });
    this.pvWatcher.start();
  }

  private async refreshEdaNamespaces() {
    if (!this.edactlClient) return;
    try {
      const ns = await this.edactlClient.getEdaNamespaces();
      this.edaNamespaces = ns || [];
      await this.setupNamespacedWatchers('pods', this.podWatchers, this.podsCache, 'Pod');
      await this.setupNamespacedWatchers('services', this.serviceWatchers, this.servicesCache, 'Service');
      await this.setupNamespacedWatchers('configmaps', this.configMapWatchers, this.configMapsCache, 'ConfigMap');
      await this.setupNamespacedWatchers('secrets', this.secretWatchers, this.secretsCache, 'Secret');
      await this.setupNamespacedWatchers('persistentvolumeclaims', this.pvcWatchers, this.pvcsCache, 'PVC');
      await this.setupNamespacedWatchers('endpoints', this.endpointsWatchers, this.endpointsCache, 'Endpoints');
      await this.setupNamespacedWatchers('deployments', this.deploymentWatchers, this.deploymentsCache, 'Deployment');
      await this.setupNamespacedWatchers('replicasets', this.replicaSetWatchers, this.replicaSetsCache, 'ReplicaSet');
      await this.setupNamespacedWatchers('statefulsets', this.statefulSetWatchers, this.statefulSetsCache, 'StatefulSet');
      await this.setupNamespacedWatchers('daemonsets', this.daemonSetWatchers, this.daemonSetsCache, 'DaemonSet');
      await this.setupNamespacedWatchers('jobs', this.jobWatchers, this.jobsCache, 'Job');
      await this.setupNamespacedWatchers('cronjobs', this.cronJobWatchers, this.cronJobsCache, 'CronJob');
      await this.setupNamespacedWatchers('ingresses', this.ingressWatchers, this.ingressesCache, 'Ingress');
      for (const crd of this.crdsCache) {
        if (crd.spec?.scope === 'Namespaced') {
          await this.startResourceWatcher(crd);
        }
      }
    } catch (err) {
      log(`Failed to refresh EDA namespaces: ${err}`, LogLevel.ERROR);
    }
  }

  private async setupNamespacedWatchers(
    resource: string,
    map: Map<string, KubectlWatcher>,
    cache: Map<string, KubernetesObject[]>,
    kind: string,
  ): Promise<void> {
    for (const ns of this.edaNamespaces) {
      const key = `${resource}_${ns}`;
      if (map.has(key)) continue;
      const watcher = new KubectlWatcher(this.kubectlPath, ['get', resource], { namespace: ns } as KubectlOptions);
      this.attachNamespacedWatcherHandlers(watcher, ns, key, cache, kind);
      map.set(key, watcher);
      watcher.start();
    }
    this.cleanupStaleWatchers(map, `${resource}_`);
  }

  private attachNamespacedWatcherHandlers(
    watcher: KubectlWatcher,
    namespace: string,
    key: string,
    cache: Map<string, KubernetesObject[]>,
    resourceKind: string,
  ) {
    watcher.on('add', obj => {
      const arr = cache.get(key) || [];
      if (!arr.find(o => o.metadata?.uid === obj.metadata?.uid)) {
        arr.push(obj);
        cache.set(key, arr);
        setTimeout(() => this._onResourceChanged.fire(), 50);
      }
    });
    watcher.on('update', obj => {
      const arr = cache.get(key) || [];
      const idx = arr.findIndex(o => o.metadata?.uid === obj.metadata?.uid);
      if (idx >= 0) arr[idx] = obj; else arr.push(obj);
      cache.set(key, arr);
      this.debouncedFireResourceChanged();
    });
    watcher.on('delete', obj => {
      let arr = cache.get(key) || [];
      arr = arr.filter(o => o.metadata?.uid !== obj.metadata?.uid);
      cache.set(key, arr);
      this.debouncedFireResourceChanged();
    });
    watcher.on('error', err => {
      log(`${resourceKind} watcher error for ${namespace}: ${err}`, LogLevel.ERROR);
      setTimeout(() => {
        watcher.start();
      }, 5000);
    });
  }

  private cleanupStaleWatchers(map: Map<string, KubectlWatcher>, prefix: string) {
    for (const [key, watcher] of map.entries()) {
      if (key.startsWith(prefix)) {
        const ns = key.substring(prefix.length);
        if (!this.edaNamespaces.includes(ns)) {
          watcher.stop();
          map.delete(key);
        }
      }
    }
  }

  private async startResourceWatcher(crd: any): Promise<void> {
    const group = crd.spec?.group || '';
    if (!group || group.endsWith('k8s.io')) return;
    const versionObj = crd.spec?.versions?.find((v: any) => v.served) || crd.spec?.versions?.[0];
    if (!versionObj) return;
    const version = versionObj.name;
    const plural = crd.spec?.names?.plural || '';
    if (!plural) return;

    if (crd.spec.scope === 'Cluster') {
      const key = `${group}_${version}_${plural}`;
      if (this.resourceWatchers.has(key)) return;
      const resource = `${plural}.${group}/${version}`;
      const watcher = new KubectlWatcher(this.kubectlPath, ['get', resource]);
      this.attachResourceWatcherHandlers(watcher, crd, key);
      this.resourceWatchers.set(key, watcher);
      watcher.start();
    } else {
      const baseKey = `${group}_${version}_${plural}`;
      for (const ns of this.edaNamespaces) {
        const nsKey = `${baseKey}_${ns}`;
        if (this.resourceWatchers.has(nsKey)) continue;
        const resource = `${plural}.${group}/${version}`;
        const watcher = new KubectlWatcher(this.kubectlPath, ['get', resource], { namespace: ns } as KubectlOptions);
        this.attachResourceWatcherHandlers(watcher, crd, nsKey);
        this.resourceWatchers.set(nsKey, watcher);
        watcher.start();
      }
      for (const [k, w] of this.resourceWatchers.entries()) {
        if (k.startsWith(`${baseKey}_`)) {
          const nsPart = k.split('_')[3];
          if (!this.edaNamespaces.includes(nsPart)) {
            w.stop();
            this.resourceWatchers.delete(k);
          }
        }
      }
    }
  }

  private attachResourceWatcherHandlers(
    watcher: KubectlWatcher,
    crd: any,
    key: string,
  ) {
    watcher.on('add', obj => {
      const arr = this.resourceCache.get(key) || [];
      if (!arr.find(o => o.metadata?.uid === obj.metadata?.uid)) {
        arr.push(obj);
        this.resourceCache.set(key, arr);
        if (crd.spec?.names?.kind === 'Deviation') this._onDeviationChanged.fire();
        if (crd.spec?.names?.kind === 'TransactionResult') this._onTransactionChanged.fire();
        setTimeout(() => this._onResourceChanged.fire(), 50);
      }
    });
    watcher.on('update', obj => {
      const arr = this.resourceCache.get(key) || [];
      const idx = arr.findIndex(o => o.metadata?.uid === obj.metadata?.uid);
      if (idx >= 0) arr[idx] = obj; else arr.push(obj);
      this.resourceCache.set(key, arr);
      if (crd.spec?.names?.kind === 'Deviation') this._onDeviationChanged.fire();
      if (crd.spec?.names?.kind === 'TransactionResult') this._onTransactionChanged.fire();
      this.debouncedFireResourceChanged();
    });
    watcher.on('delete', obj => {
      let arr = this.resourceCache.get(key) || [];
      arr = arr.filter(o => o.metadata?.uid !== obj.metadata?.uid);
      this.resourceCache.set(key, arr);
      if (crd.spec?.names?.kind === 'Deviation') this._onDeviationChanged.fire();
      if (crd.spec?.names?.kind === 'TransactionResult') this._onTransactionChanged.fire();
      this.debouncedFireResourceChanged();
    });
    watcher.on('error', err => {
      log(`Resource watcher error for ${key}: ${err}`, LogLevel.ERROR);
      setTimeout(() => watcher.start(), 5000);
    });
  }

  public dispose(): void {
    this.stopAllWatchers();
    this._onResourceChanged.dispose();
    this._onDeviationChanged.dispose();
    this._onTransactionChanged.dispose();
    this.clearAllCaches();
  }

  private stopAllWatchers(): void {
    this.crdWatcher?.stop();
    this.namespaceWatcher?.stop();
    this.pvWatcher?.stop();
    for (const w of this.podWatchers.values()) w.stop();
    for (const w of this.serviceWatchers.values()) w.stop();
    for (const w of this.configMapWatchers.values()) w.stop();
    for (const w of this.secretWatchers.values()) w.stop();
    for (const w of this.pvcWatchers.values()) w.stop();
    for (const w of this.endpointsWatchers.values()) w.stop();
    for (const w of this.deploymentWatchers.values()) w.stop();
    for (const w of this.replicaSetWatchers.values()) w.stop();
    for (const w of this.statefulSetWatchers.values()) w.stop();
    for (const w of this.daemonSetWatchers.values()) w.stop();
    for (const w of this.jobWatchers.values()) w.stop();
    for (const w of this.cronJobWatchers.values()) w.stop();
    for (const w of this.ingressWatchers.values()) w.stop();
    for (const w of this.resourceWatchers.values()) w.stop();

    this.podWatchers.clear();
    this.serviceWatchers.clear();
    this.configMapWatchers.clear();
    this.secretWatchers.clear();
    this.pvcWatchers.clear();
    this.endpointsWatchers.clear();
    this.deploymentWatchers.clear();
    this.replicaSetWatchers.clear();
    this.statefulSetWatchers.clear();
    this.daemonSetWatchers.clear();
    this.jobWatchers.clear();
    this.cronJobWatchers.clear();
    this.ingressWatchers.clear();
    this.resourceWatchers.clear();
  }

  private clearAllCaches(): void {
    this.crdsCache = [];
    this.namespacesCache = [];
    this.pvsCache = [];
    this.podsCache.clear();
    this.servicesCache.clear();
    this.configMapsCache.clear();
    this.secretsCache.clear();
    this.pvcsCache.clear();
    this.endpointsCache.clear();
    this.deploymentsCache.clear();
    this.replicaSetsCache.clear();
    this.statefulSetsCache.clear();
    this.daemonSetsCache.clear();
    this.jobsCache.clear();
    this.cronJobsCache.clear();
    this.ingressesCache.clear();
    this.resourceCache.clear();
  }

  private debouncedFireResourceChanged(): void {
    if (this.resourceChangeDebounceTimer) {
      clearTimeout(this.resourceChangeDebounceTimer);
    }
    this.resourceChangesPending = true;
    this.resourceChangeDebounceTimer = setTimeout(() => {
      if (this.resourceChangesPending) {
        this._onResourceChanged.fire();
        this.resourceChangesPending = false;
      }
      this.resourceChangeDebounceTimer = null;
    }, 100);
  }

  public getCachedCrds(): any[] { return this.crdsCache; }
  public getCachedNamespaces(): any[] { return this.namespacesCache; }
  public getCachedPods(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.podsCache, ns); }
  public getCachedServices(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.servicesCache, ns); }
  public getCachedConfigMaps(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.configMapsCache, ns); }
  public getCachedSecrets(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.secretsCache, ns); }
  public getCachedPVCs(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.pvcsCache, ns); }
  public getCachedPVs(): KubernetesObject[] { return this.pvsCache; }
  public getCachedEndpoints(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.endpointsCache, ns); }
  public getCachedDeployments(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.deploymentsCache, ns); }
  public getCachedReplicaSets(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.replicaSetsCache, ns); }
  public getCachedStatefulSets(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.statefulSetsCache, ns); }
  public getCachedDaemonSets(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.daemonSetsCache, ns); }
  public getCachedJobs(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.jobsCache, ns); }
  public getCachedCronJobs(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.cronJobsCache, ns); }
  public getCachedIngresses(ns?: string): KubernetesObject[] { return this.getCachedFromMap(this.ingressesCache, ns); }

  private getCachedFromMap<T>(map: Map<string, T[]>, namespace?: string): T[] {
    let results: T[] = [];
    if (namespace) {
      const key = `${Array.from(map.keys())[0]?.split('_')[0]}_${namespace}`;
      const items = map.get(key);
      if (items) results = [...items];
    } else {
      for (const items of map.values()) results.push(...items);
    }
    return results;
  }

  public getCachedResources(group: string, version: string, plural: string, namespace?: string): KubernetesObject[] {
    let results: KubernetesObject[] = [];
    for (const [key, resources] of this.resourceCache.entries()) {
      const parts = key.split('_');
      const kGroup = parts[0];
      const kVersion = parts[1];
      const kPlural = parts[2];
      const kNs = parts[3];
      if (kGroup === group && kVersion === version && kPlural === plural) {
        if (namespace) {
          if (kNs === namespace) results = [...results, ...resources];
          else results = [...results, ...resources.filter(r => r.metadata?.namespace === namespace)];
        } else {
          results = [...results, ...resources];
        }
      }
    }
    return results;
  }

  public async listCustomResourceDefinitions(): Promise<any[]> {
    try {
      const res = runKubectlJson<{ items: any[] }>(this.kubectlPath, ['get', 'crd']);
      return res.items || [];
    } catch (err) {
      log(`Error listing CRDs: ${err}`, LogLevel.ERROR);
      return [];
    }
  }

  public async listClusterCustomObject(group: string, version: string, plural: string): Promise<{ items: any[] }> {
    const resource = `${plural}.${group}/${version}`;
    try {
      const res = runKubectlJson<{ items: any[] }>(this.kubectlPath, ['get', resource]);
      return res;
    } catch (err) {
      throw new Error(`listClusterCustomObject failed: ${err}`);
    }
  }

  public async listNamespacedCustomObject(
    group: string,
    version: string,
    namespace: string,
    plural: string
  ): Promise<{ items: any[] }> {
    const resource = `${plural}.${group}/${version}`;
    try {
      const res = runKubectlJson<{ items: any[] }>(this.kubectlPath, ['get', resource], { namespace });
      return res;
    } catch (err) {
      throw new Error(`listNamespacedCustomObject failed: ${err}`);
    }
  }
}
