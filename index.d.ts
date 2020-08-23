import type {
  Channel,
  Client,
  Client as DiscordClient,
  ClientOptions,
  EventDispatcher,
  Guild,
  Store,
  User
} from "@kyudiscord/neo";
import type { Client as VezaClient, ClientSocket, SendOptions, Server } from "veza";
import type { Worker } from "cluster";

declare module "@kyudiscord/neo" {
  interface Client {
    shard: ShardUtil<this>;
  }
}

export class ShardUtil<C extends Client> {
  readonly client: C;
  /**
   * The ID of this shard.
   */
  readonly id: number;
  /**
   * The IPC for this shard.
   */
  readonly ipc: ClusterIPC<C>;
  /**
   * The IPC socket of this shard.
   */
  ipcSocket: number | string;

  /**
   * @param client
   * @param ipcSocket
   */
  constructor(client: C, ipcSocket: number | string);

  /**
   * The total shard count..
   */
  get shardCount(): number;

  /**
   * The total cluster count.
   */
  get clusterCount(): number;

  /**
   * Sends a message to the cluster.
   * @param data The data to send.
   * @param options The send options.
   */
  send<T = unknown>(data: Dictionary | any, options?: SendOptions): Promise<T>;

  /**
   * Broadcasts a script to run on all shards.
   * @param script The script to broadcast.
   */
  broadcastEval<T = unknown>(script: EvalScript): Promise<T[]>;

  /**
   * Evaluates a script on the master process.
   * @param script The script to evaluate.
   */
  masterEval<T = unknown>(script: EvalScript): Promise<T>;

  /**
   * Fetch a client value on all clusters.
   * @param property The property to fetch.
   */
  fetchClientValues<T = unknown>(property: string): Promise<T[]>;

  /**
   * Fetches a guild.
   * @param id The id of the guild to fetch.
   */
  fetchGuild<G extends Guild = Guild>(id: string): Promise<Readonly<G>>;

  /**
   * Fetches a channel.
   * @param id The id of the channel to fetch.
   */
  fetchChannel<C extends Channel = Channel>(id: string): Promise<Readonly<C>>;

  /**
   * Fetches a user.
   * @param id The id of the user to fetch.
   */
  fetchUser<U extends User = User>(id: string): Promise<Readonly<U>>;

  /**
   * Restarts all clusters.
   */
  restartAll(): Promise<void>;

  /**
   * Restarts a specific cluster.
   * @param clusterId The cluster to restart.
   */
  restart(clusterId?: number): Promise<void>;
}

export abstract class BaseCluster<C extends Client> {
  /**
   * The id of this cluster.
   */
  readonly id: number;
  /**
   * The client instance.
   */
  readonly client: C;
  /**
   * The sharding manager.
   */
  manager: ShardingManager;

  /**
   * @param manager
   */
  constructor(manager: ShardingManager);

  /**
   * Initializes the base cluster.
   */
  init(): Promise<void>;

  /**
   * Launches this cluster.
   */
  protected abstract launch(): void | Promise<void>;
}

export class Cluster extends EventDispatcher {
  /**
   * The sharding manager.
   */
  readonly manager: ShardingManager;
  /**
   * The id of this cluster.
   */
  readonly id: number;
  /**
   * The cluster worker.
   */
  worker?: Worker;
  /**
   * The shards of this cluster.
   */
  shards: number[];
  /**
   * Whether this cluster is ready or not.
   */
  ready: boolean;

  /**
   * @param manager
   * @param options
   */
  constructor(manager: ShardingManager, options: ClusterOptions);

  /**
   * Evaluates a script.
   * @param script The script to evaluate.
   */
  eval<T = unknown>(script: EvalScript): Promise<T>;

  /**
   * Fetches a property of the client.
   * @param property The property.
   */
  fetchClientValue<T = unknown>(property: string): Promise<T>;

  /**
   * Kills the cluster worker.
   */
  kill(): void;

  /**
   * Respawns the worker.
   * @param delay The delay.
   */
  respawn(delay?: number): Promise<void>;

  /**
   * Sends data to the cluster ipc.
   * @param data The data to send.
   */
  send<T = unknown>(data: Dictionary): Promise<T>;

  /**
   * Spawns the cluster worker.
   */
  spawn(): Promise<void>;
}

export interface ClusterOptions {
  id: number;
  shards: number[];
}

export class ClusterIPC<C extends DiscordClient> extends EventDispatcher {
  readonly discord: C;
  /**
   * The veza
   */
  readonly client: VezaClient;
  /**
   * The cluster id.
   */
  id: number;
  /**
   * The socket to use.
   */
  socket: string | number;

  /**
   * @param discord The discord client.
   * @param id The cluster id.
   * @param socket The socket.
   */
  constructor(discord: C, id: number, socket: string | number);

  /**
   * Returns the client socket.
   */
  get server(): ClientSocket;

  /**
   * Initializes the client socket.
   */
  init(): Promise<void>;

  /**
   * Broadcasts a script to all clusters.
   * @param script The script to broadcast.
   */
  broadcast<T>(script: EvalScript): Promise<T[]>;

  /**
   * Evaluates a script on the master process.
   * @param script The script to evaluate.
   */
  masterEval<T>(script: EvalScript): Promise<T>;
}

export type EvalScript = string | ((this: Client, ...args: unknown[]) => unknown | Promise<unknown[]>);

export interface IPCRequest {
  op: IPCEvent;
  d: string;
}

export interface IPCResult {
  success: boolean;
  d: unknown;
}

export interface IPCError {
  name: string;
  message: string;
  stack: string;
}

export class MasterIPC extends EventDispatcher {
  /**
   * The sharding manager.
   */
  readonly manager: ShardingManager;
  /**
   * The IPC Server.
   */
  readonly server: Server;

  /**
   * @param manager
   */
  constructor(manager: ShardingManager);

  /**
   * Broadcasts a script to every cluster.
   * @param script The script to broadcast.
   */
  broadcast<T = unknown>(script: EvalScript): Promise<T[]>;
}

export class ShardingManager extends EventDispatcher {
  /**
   * The path to the main file.
   */
  readonly path: string;
  /**
   * Cluster store.
   */
  readonly clusters: Store<number, Cluster>;
  /**
   * The master IPC.
   */
  readonly ipc: MasterIPC;
  /**
   * The number of guilds per shard.
   */
  guildsPerShard: number;
  /**
   * The client to use.
   */
  createClient: CreateClient;
  /**
   * The IPC socket.
   */
  ipcSocket: number | string;
  /**
   * The shards to spawn.
   */
  shardCount: number | "auto";
  /**
   * The clusters to spawn.
   */
  clusterCount: number;
  /**
   * Whether to retry.
   */
  retry: boolean;
  /**
   * The arguments to pass to the clusters.
   */
  nodeArgs: string[];
  /**
   * Whether or not to respawn workers if they exit.
   */
  respawn: boolean;
  /**
   * The timeout.
   */
  timeout: number;
  /**
   * Amount of retries to use for respawning.
   */
  retries: number;
  /**
   * Env Variables to Pass.
   */
  env: Dictionary;

  /**
   * @param path
   * @param options
   */
  constructor(path: string, options: SharderOptions);

  /**
   * The provided token.
   */
  get token(): string;

  /**
   * Spawns all clusters and shards.
   */
  spawn(): Promise<void>;

  /**
   * Fetch a client property from all shards.
   * @param property
   */
  fetchClientValues<T>(property: string): Promise<Readonly<T>[]>;

  /**
   * Evaluate a script in 'this' context.
   * @param script The script to eval.
   */
  eval<T = unknown>(script: string): Promise<T>;

  /**
   * Restarts all clusters.
   */
  respawnAll(): Promise<void>;

  /**
   * Respawns a specific cluster.
   * @param clusterId The cluster to respawn.
   */
  restart(clusterId: number): Promise<void>;
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

/**
 * Makes an error from a plain object.
 * @param obj The error object.
 */
export function makeError(obj: ErrorObject): Error;

export interface ErrorObject {
  stack: string;
  message: string;
  name: string;
}

/**
 * Chunks an array.
 * @param entries The entries to chunk.
 * @param chunks How many chunks to create.
 */
export function chunk<T>(entries: T[], chunks: number): Array<T[]>;

export enum IPCEvent {
  EVAL = 0,
  MESSAGE = 1,
  BROADCAST = 2,
  READY = 3,
  SHARD_READY = 4,
  SHARD_RECONNECT = 5,
  SHARD_RESUME = 6,
  SHARD_DISCONNECT = 7,
  MASTER_EVAL = 8,
  RESTART_ALL = 9,
  RESTART = 10,
  FETCH_USER = 11,
  FETCH_CHANNEL = 12,
  FETCH_GUILD = 13
}

export enum SharderEvent {
  DEBUG = "debug",
  MESSAGE = "message",
  READY = "ready",
  SPAWN = "spawn",
  SHARD_READY = "shardReady",
  SHARD_RECONNECT = "shardReconnect",
  SHARD_RESUME = "shardResume",
  SHARD_DISCONNECT = "shardDisconnect",
  ERROR = "error"
}

