import { IPCEvent } from "../../util";
import { ShardUtil } from "../shard/ShardUtil";

import type { Client, ClientOptions } from "@kyudiscord/neo";
import type { ShardingManager } from "../shard/ShardingManager";

export abstract class BaseCluster<C extends Client> {
  /**
   * The id of this cluster.
   */
  public readonly id: number;

  /**
   * The client instance.
   */
  public readonly client: C;

  /**
   * The sharding manager.
   */
  public manager: ShardingManager;

  /**
   * @param manager
   */
  public constructor(manager: ShardingManager) {
    this.manager = manager;

    const env = process.env;
    const shards = env.CLUSTER_SHARDS?.split(",").map((s) => +s);
    const clientOptions: ClientOptions = {
      shards,
      shardCount: +env.CLUSTER_SHARD_COUNT!
    };

    this.client = manager.createClient(manager.token, clientOptions) as C;
    this.id = +env.CLUSTER_ID!;
    this.client.shard = new ShardUtil<C>(this.client, manager.ipcSocket);
  }

  /**
   * Initializes the base cluster.
   */
  public async init(): Promise<void> {
    await this.client
      .once("ready", this._ready.bind(this))
      .on("shardReady", this._shardReady.bind(this))
      .on("shardReconnecting", this._shardReconnecting.bind(this))
      .on("shardResumed", this._shardResumed.bind(this))
      .on("shardDisconnect", this._shardDisconnect.bind(this))
      .shard.ipc.init();

    await this.launch();
  }

  /**
   * Launches this cluster.
   */
  protected abstract launch(): void | Promise<void>;

  /**
   * @private
   */
  private async _ready(): Promise<void> {
    await this.client.shard.send({
      op: IPCEvent.READY,
      d: this.id
    }, { receptive: false });
  }

  /**
   * @private
   */
  private async _shardReady(id: string): Promise<void> {
    await this.client.shard.send({
      op: IPCEvent.SHARD_READY,
      d: {
        shardId: id,
        id: this.id
      }
    }, { receptive: false });
  }

  /**
   * @private
   */
  private async _shardReconnecting(id: string): Promise<void> {
    await this.client.shard.send({
      op: IPCEvent.SHARD_RECONNECT,
      d: {
        id: this.id,
        shardId: id
      }
    }, { receptive: false });
  }

  /**
   * @private
   */
  private async _shardResumed(id: string, replayed: number) {
    await this.client.shard.send({
      op: IPCEvent.SHARD_RESUME,
      d: {
        id: this.id,
        shardId: id,
        replayed
      }
    }, { receptive: false });
  }

  /**
   * @private
   */
  private async _shardDisconnect({ code, reason, wasClean }: Dictionary, id: string) {
    await this.client.shard.send({
      op: IPCEvent.SHARD_DISCONNECT,
      d: {
        id: this.id,
        shardId: id,
        closeEvent: { code, reason, wasClean }
      }
    }, { receptive: false });
  }
}