import { Client, ClientOptions, constants, EventDispatcher, Store } from "@kyudiscord/neo";
import { isMaster, setupMaster } from "cluster";
import { cpus } from "os";
import fetch from "node-fetch";
import { MasterIPC } from "../ipc/MasterIPC";
import { Cluster } from "../cluster/Cluster";
import { chunk, SharderEvent } from "../../util";
import { BaseCluster } from "../cluster/BaseCluster";

export class ShardingManager extends EventDispatcher {
  /**
   * The path to the main file.
   */
  public readonly path: string;

  /**
   * Cluster store.
   */
  public readonly clusters: Store<number, Cluster>;

  /**
   * The master IPC.
   */
  public readonly ipc: MasterIPC;

  /**
   * The number of guilds per shard.
   */
  public guildsPerShard: number;

  /**
   * The client to use.
   */
  public createClient: CreateClient;

  /**
   * The IPC socket.
   */
  public ipcSocket: number | string;

  /**
   * The shards to spawn.
   */
  public shardCount: number | "auto";

  /**
   * The clusters to spawn.
   */
  public clusterCount: number;

  /**
   * Whether to retry.
   */
  public retry: boolean;

  /**
   * The arguments to pass to the clusters.
   */
  public nodeArgs: string[];

  /**
   * Whether or not to respawn workers if they exit.
   */
  public respawn: boolean;

  /**
   * The timeout.
   */
  public timeout: number;

  /**
   * Amount of retries to use for respawning.
   */
  public retries: number;

  /**
   * Env Variables to Pass.
   */
  public env: Dictionary;

  /**
   * The token to use when creating clients..
   */
  readonly #token: string;

  /**
   * @param path
   * @param options
   */
  public constructor(path: string, options: SharderOptions) {
    super();

    this.path = path;
    this.clusters = new Store();

    this.guildsPerShard = options.guildsPreShard ?? 1000;
    this.clusterCount = options.clusterCount ?? cpus().length;
    this.shardCount = options.shardCount ?? "auto";
    this.ipcSocket = options.ipcSocket ?? 9999;
    this.nodeArgs = options.nodeArgs ?? [];
    this.respawn = options.respawn ?? true;
    this.timeout = options.timeout ?? 30000;
    this.retries = options.retries ?? 5;
    this.#token = options.token;
    this.retry = options.retry ?? true;
    this.env = options.env ?? {};

    this.ipc = new MasterIPC(this);

    const createClient: CreateClient = (t, o) => new Client(t, o);
    this.createClient = options.createClient ?? createClient;
  }

  /**
   * The provided token.
   */
  public get token(): string {
    return this.#token;
  }

  /**
   * Spawns all clusters and shards.
   */
  public async spawn(): Promise<void> {
    if (isMaster) {
      if (this.shardCount === "auto") {
        this.emit("debug", "[Manager] Fetching Session Endpoint.");

        const { shards } = await this._fetchSession();
        this.shardCount = Math.ceil(shards * (1000 / this.guildsPerShard));

        this.emit("debug", `[Manager] Using recommend shard count of ${this.shardCount} shards. With ${this.guildsPerShard} guilds per shard.`);
      }

      this.emit("debug", `[Manager] Starting ${this.shardCount} shards in ${this.clusterCount} clusters.`);
      if (this.shardCount < this.clusterCount) this.clusterCount = this.shardCount;

      const shardArray = [ ...Array(this.shardCount).keys() ];
      const shardTuple = chunk(shardArray, this.clusterCount);
      const failed: Cluster[] = [];

      if (this.nodeArgs) setupMaster({ execArgv: this.nodeArgs });

      for (let i = 0; i < this.clusterCount; i++) {
        const shards = shardTuple.shift()!;
        const cluster = new Cluster(this, { id: i, shards });

        try {
          await cluster.spawn();
          this.clusters.set(i, cluster);
        } catch (e) {
          this.emit("debug", `[cluster-${i}] Failed to Spawn.`);
          this.emit(SharderEvent.ERROR, new Error(`Cluster ${i} failed to start.`));

          if (this.retry) {
            this.emit("debug", `[cluster-${i}] Queueing for respawn.`);
            failed.push(cluster);
          }
        }
      }

      return failed.length
        ? this.retryFailed(failed, 0)
        : void 0;
    }

    const imported = await import(this.path);
    const ClusterClass = "default" in imported ? imported.default : imported;

    if (!ClusterClass || !(ClusterClass.prototype instanceof BaseCluster))
      throw new Error(`"${this.path}" does not export a base cluster.`);

    const cluster = new ClusterClass(this) as BaseCluster<Client>;
    await cluster.init();
  }

  /**
   * Fetch a client property from all shards.
   * @param property
   */
  public fetchClientValues<T>(property: string): Promise<Readonly<T>[]> {
    return this.ipc.broadcast(`this.${property}`);
  }

  /**
   * Evaluate a script in 'this' context.
   * @param script The script to eval.
   */
  public eval<T = unknown>(script: string): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        return resolve(eval(script));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Restarts all clusters.
   */
  public async respawnAll(): Promise<void> {
    this.emit("debug", "[Manager] Respawning all clusters...");
    for (const [ , cluster ] of this.clusters) await cluster.respawn();
  }

  /**
   * Respawns a specific cluster.
   * @param clusterId The cluster to respawn.
   */
  public async restart(clusterId: number): Promise<void> {
    const cluster = this.clusters.get(clusterId);
    if (cluster) {
      this.emit("debug", `[Manager] Respawning Cluster: ${clusterId}`);
      return cluster.respawn();
    }

    throw new Error(`Cluster ${clusterId} not found.`);
  }

  /**
   * @private
   */
  private async retryFailed(clusters: Cluster[], tries: number): Promise<void> {
    const failed: Cluster[] = [];

    for (const cluster of clusters) {
      try {
        this.emit("debug", `[cluster-${cluster.id}] Respawning.`);
        await cluster.spawn();
        this.clusters.set(cluster.id, cluster);
      } catch (e) {
        this.emit("debug", `[cluster-${cluster.id}] Failed to restart, re-queueing.`);
        this.emit("error", e, cluster.id);
      }
    }

    if (failed.length && tries !== this.retries) {
      tries++;
      this.emit("debug", `[Manager] ${failed.length} clusters that still failed. Retry ${tries} out of ${this.retries}.`);
      return this.retryFailed(failed, tries);
    }
  }

  /**
   * @private
   */
  private async _fetchSession(): Promise<SessionObject> {
    const {
      api,
      version
    } = constants.clientDefaults.rest;

    const res = await fetch(`${api}/v${version}/gateway/bot`, {
      method: "get",
      headers: {
        Authorization: `Bot ${this.token.replace(/^Bot\s*/, "")}`,
        "User-Agent": "Kyu Discord (https://github.com/kyudiscord)",
      }
    });

    if (res.ok) return res.json();
    throw res;
  }
}

export type CreateClient = (token: string, options: ClientOptions) => Client;

export interface SharderOptions {
  token: string;
  shardCount?: number | "auto";
  clusterCount?: number;
  createClient?: CreateClient;
  guildsPreShard?: number;
  respawn?: boolean;
  ipcSocket?: string | number;
  timeout?: number;
  retry?: boolean;
  retries?: number;
  nodeArgs?: string[];
  env?: Dictionary;
}

export interface SessionObject {
  url: string;
  shards: number;
  session_start_limit: {
    total: number;
    remaining: number;
    reset_after: number;
  };
}
