import { EventDispatcher } from "@kyudiscord/neo";
import type { ShardingManager } from "../shard/ShardingManager";

export class Cluster extends EventDispatcher {
  /**
   * The sharding manager.
   */
  public readonly manager: ShardingManager;

  /**
   * The id of this cluster.
   */
  public id: number;

  /**
   * The shards of this cluster.
   */
  public shards: number[];

  /**
   * @param manager 
   * @param options 
   */
  public constructor(manager: ShardingManager, options: ClusterOptions) {
    super();
    
    this.manager = manager;
    this.id = options.id;
    this.shards = options.shards;
  }
}

export interface ClusterOptions {
  id: number;
  shards: number[];
}
