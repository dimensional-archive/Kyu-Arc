import type { Client } from "@kyudiscord/neo";

export class ShardUtil<C extends Client> {
  public readonly client: C;

  /**
   * The ID of this shard.
   */
  public readonly id: number;

  /**
   * The IPC socket of this shard.
   */
  public ipcSocket: number | string;

  /**
   * @param client 
   * @param ipcSocket 
   */
  public constructor(client: C, ipcSocket: number | string) {
    this.client = client;
    this.id = +process.env.CLUSTER_ID!;

    this.ipcSocket = ipcSocket;
  }

  /**
   * The total shard count..
   */
  public get shardCount(): number {
    return +process.env.CLUSTER_SHARD_COUNT!;
  }

  /**
   * The total cluster count.
   */
  public get clusterCount(): number {
    return +process.env.CLUSTER_CLUSTER_COUNT!;
  }
}