import { EventDispatcher, Timers, Util } from "@kyudiscord/neo";
import { fork, Worker } from "cluster";
import { IPCEvent, makeError } from "../../util";

import type { ShardingManager } from "../shard/ShardingManager";
import type { EvalScript } from "../ipc/ClusterIPC";

export class Cluster extends EventDispatcher {
  /**
   * The sharding manager.
   */
  public readonly manager: ShardingManager;

  /**
   * The id of this cluster.
   */
  public readonly id: number;

  /**
   * The cluster worker.
   */
  public worker?: Worker;

  /**
   * The shards of this cluster.
   */
  public shards: number[];

  /**
   * Whether this cluster is ready or not.
   */
  public ready = false;

  /**
   * @param manager
   * @param options
   */
  public constructor(manager: ShardingManager, options: ClusterOptions) {
    super();

    this.manager = manager;
    this.id = options.id;
    this.shards = options.shards;

    this._exit = this._exit.bind(this);
    this.once("ready", () => this.ready = true);
  }

  /**
   * Evaluates a script.
   * @param script The script to evaluate.
   */
  public async eval<T = unknown>(script: EvalScript): Promise<T> {
    script = typeof script === "function"
      ? `(${script})(this)`
      : script;

    const { success, d } = await this.manager.ipc.server.sendTo(`cluster-${this.id}`, {
      op: IPCEvent.EVAL,
      d: script
    });

    if (!success) throw makeError(d);
    return d;
  }

  /**
   * Fetches a property of the client.
   * @param property The property.
   */
  public async fetchClientValue<T = unknown>(property: string): Promise<T> {
    return this.eval(`this.${property}`);
  }

  /**
   * Kills the cluster worker.
   */
  public kill(): void {
    if (this.worker) {
      this.manager.emit("debug", `[cluster-${this.id}] Killing the Worker.`);
      this.worker.removeListener("exit", this._exit);
      this.worker.kill();
    }
  }

  /**
   * Respawns the worker.
   * @param delay The delay.
   */
  public async respawn(delay = 500): Promise<void> {
    this.kill();
    if (delay) await Util.sleep(delay);
    await this.spawn();
  }

  /**
   * Sends data to the cluster ipc.
   * @param data The data to send.
   */
  public send<T = unknown>(data: Dictionary): Promise<T> {
    return this.manager.ipc.server.sendTo(`cluster-${this.id}`, data);
  }

  /**
   * Spawns the cluster worker.
   */
  public async spawn(): Promise<void> {
    this.worker = fork({
      CLUSTER_SHARDS: this.shards.join(","),
      CLUSTER_ID: this.id,
      CLUSTER_SHARD_COUNT: this.manager.shardCount,
      CLUSTER_CLUSTER_COUNT: this.manager.clusterCount,
      ...this.manager.env
    })
      .once("exit", this._exit);

    this.manager.emit("debug", `[cluster-${this.id}] Worker spawned with id: ${this.worker.id}`);
    this.manager.emit("spawn", this);

    await this._waitReady(this.shards.length);
    await Util.sleep(5000);
  }

  /**
   * @private
   */
  private async _exit(code: number, signal: string) {
    this.ready = false;
    this.worker = undefined;

    if (this.manager.respawn) {
      await this.respawn();
    }

    this.manager.emit("debug", `[cluster-${this.id}] Worker Exited with code '${code}' and signal ${signal}${this.manager.respawn ? ", respawning..." : "."}`);
  }

  /**
   * @private
   */
  private _waitReady(shardCount: number) {
    return new Promise((resolve, reject) => {
      this.once("ready", resolve);

      const ms = (this.manager.timeout * shardCount) * (this.manager.guildsPerShard / 1000);
      Timers.setTimeout(() => {
        reject(new Error(`[cluster-${this.id}] Took too long to get ready`));
      }, ms);
    });
  }
}

export interface ClusterOptions {
  id: number;
  shards: number[];
}
