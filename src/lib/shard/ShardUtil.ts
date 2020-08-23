import { ClusterIPC, EvalScript, IPCError, IPCResult } from "../ipc/ClusterIPC";
import { IPCEvent, makeError } from "../../util";

import type { Channel, Client, Guild, User } from "@kyudiscord/neo";
import type { SendOptions } from "veza";

export class ShardUtil<C extends Client> {
  public readonly client: C;

  /**
   * The ID of this shard.
   */
  public readonly id: number;

  /**
   * The IPC for this shard.
   */
  public readonly ipc: ClusterIPC<C>;

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
    this.ipc = new ClusterIPC<C>(client, this.id, ipcSocket);

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

  /**
   * Sends a message to the cluster.
   * @param data The data to send.
   * @param options The send options.
   */
  public send<T = unknown>(data: Dictionary | any, options: SendOptions = {}): Promise<T> {
    return (data?.op !== undefined
      ? this.ipc.server.send(data, options)
      : this.ipc.server.send({ op: IPCEvent.MESSAGE, d: data }, options)) as Promise<T>;
  }

  /**
   * Broadcasts a script to run on all shards.
   * @param script The script to broadcast.
   */
  public broadcastEval<T = unknown>(script: EvalScript): Promise<T[]> {
    return this.ipc.broadcast(script);
  }

  /**
   * Evaluates a script on the master process.
   * @param script The script to evaluate.
   */
  public masterEval<T = unknown>(script: EvalScript): Promise<T> {
    return this.ipc.masterEval(script);
  }

  /**
   * Fetch a client value on all clusters.
   * @param property The property to fetch.
   */
  public fetchClientValues<T = unknown>(property: string): Promise<T[]> {
    return this.broadcastEval(`this.${property}`);
  }

  /**
   * Fetches a guild.
   * @param id The id of the guild to fetch.
   */
  public async fetchGuild<G extends Guild = Guild>(id: string): Promise<Readonly<G>> {
    const { success, d } = await this.send<IPCResult>({
      op: IPCEvent.FETCH_GUILD,
      d: id
    });

    if (!success) throw new Error(`No guild with ${id} was found.`);
    return d as Readonly<G>;
  }

  /**
   * Fetches a channel.
   * @param id The id of the channel to fetch.
   */
  public async fetchChannel<C extends Channel = Channel>(id: string): Promise<Readonly<C>> {
    const { success, d } = await this.send<IPCResult>({
      op: IPCEvent.FETCH_CHANNEL,
      d: id
    });

    if (!success) throw new Error(`No channel with ${id} was found.`);
    return d as Readonly<C>;
  }

  /**
   * Fetches a user.
   * @param id The id of the user to fetch.
   */
  public async fetchUser<U extends User = User>(id: string): Promise<Readonly<U>> {
    const { success, d } = await this.send<IPCResult>({
      op: IPCEvent.FETCH_USER,
      d: id
    });

    if (!success) throw new Error(`No user with ${id} was found.`);
    return d as Readonly<U>;
  }

  /**
   * Restarts all clusters.
   */
  public async restartAll(): Promise<void> {
    await this.ipc.server.send({ op: IPCEvent.RESTART_ALL }, { receptive: false });
  }

  /**
   * Restarts a specific cluster.
   * @param clusterId The cluster to restart.
   */
  public async restart(clusterId = this.id): Promise<void> {
    const { success, d } = await this.ipc.server.send({
      op: IPCEvent.RESTART,
      d: clusterId
    }) as IPCResult;

    if (!success) throw makeError(d as IPCError);
  }
}