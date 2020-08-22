import type { Client } from "@kyudiscord/neo";
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
    const clientOptions = {
      shards,
      shardCount: +env.CLUSTER_SHARD_COUNT!
    };

    this.client = manager.createClient(manager.token, clientOptions) as C;
    this.id = +env.CLUSTER_ID!;
  }

  public async init(): Promise<void> {
    return;
  }

  /**
   * Launches this cluster.
   */
  protected abstract launch(): void | Promise<void>
}