import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { KubectlOptions } from './kubectlRunner';

export interface WatchEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  object: any;
}

export class KubectlWatcher extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private kubectlPath: string;
  private args: string[];
  private options: KubectlOptions;
  private running = false;
  private stopped = false;

  constructor(kubectlPath: string, args: string[], options: KubectlOptions = {}) {
    super();
    this.kubectlPath = kubectlPath;
    this.args = args;
    this.options = options;
  }

  public start(): void {
    if (this.running || this.stopped) {
      return;
    }
    const watchArgs = [...this.args];
    if (this.options.namespace) {
      watchArgs.unshift('--namespace', this.options.namespace);
    }
    watchArgs.push('--watch', '-o', 'json');
    this.proc = spawn(this.kubectlPath, watchArgs);
    this.running = true;
    this.proc.stdout.on('data', data => this.handleData(data.toString()));
    this.proc.stderr.on('data', err => this.emit('error', new Error(err.toString())));
    this.proc.on('close', () => {
      this.running = false;
      this.emit('end');
    });
  }

  public stop(): void {
    this.stopped = true;
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
      this.running = false;
    }
  }

  public isRunning(): boolean {
    return this.running;
  }

  public isStopped(): boolean {
    return this.stopped;
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as WatchEvent;
        switch (evt.type) {
          case 'ADDED':
            this.emit('add', evt.object);
            break;
          case 'MODIFIED':
            this.emit('update', evt.object);
            break;
          case 'DELETED':
            this.emit('delete', evt.object);
            break;
        }
      } catch (err) {
        this.emit('error', err);
      }
    }
  }
}
