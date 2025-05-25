/**
 * Unit tests for the KubectlWatcher utility.
 *
 * The watcher spawns kubectl with `--watch -o json` and emits add, update and
 * delete events as JSON objects are read from stdout. To test this behaviour
 * without running kubectl we stub `child_process.spawn` and feed fake data
 * through the stdout EventEmitter. We verify that each type of watch event
 * results in the correct event being emitted with the parsed object. We also
 * ensure that invalid JSON triggers the `error` event.
 */
import { expect } from '../helpers/setup';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import childProcess from 'child_process';
import { KubectlWatcher } from '../../src/utils/kubectlWatcher';

describe('KubectlWatcher', () => {
  let spawnStub: sinon.SinonStub;
  let stdout: EventEmitter;
  let stderr: EventEmitter;
  let fakeProc: any;

  beforeEach(() => {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    fakeProc = new EventEmitter();
    Object.assign(fakeProc, { stdout, stderr, kill: sinon.stub() });
    spawnStub = sinon.stub(childProcess, 'spawn').returns(fakeProc);
  });

  afterEach(() => {
    spawnStub.restore();
  });

  it('emits add, update, and delete events with parsed objects', () => {
    const watcher = new KubectlWatcher('kubectl', ['get', 'pods']);
    const add = sinon.spy();
    const update = sinon.spy();
    const del = sinon.spy();
    watcher.on('add', add);
    watcher.on('update', update);
    watcher.on('delete', del);

    watcher.start();

    stdout.emit('data', JSON.stringify({ type: 'ADDED', object: { id: 1 } }) + '\n');
    stdout.emit('data', JSON.stringify({ type: 'MODIFIED', object: { id: 2 } }) + '\n');
    stdout.emit('data', JSON.stringify({ type: 'DELETED', object: { id: 3 } }) + '\n');

    expect(add.calledOnceWithExactly({ id: 1 })).to.be.true;
    expect(update.calledOnceWithExactly({ id: 2 })).to.be.true;
    expect(del.calledOnceWithExactly({ id: 3 })).to.be.true;
  });

  it('emits an error event when invalid JSON is received', () => {
    const watcher = new KubectlWatcher('kubectl', ['get', 'pods']);
    const err = sinon.spy();
    watcher.on('error', err);

    watcher.start();

    stdout.emit('data', 'not-json\n');

    expect(err.calledOnce).to.be.true;
  });
});
