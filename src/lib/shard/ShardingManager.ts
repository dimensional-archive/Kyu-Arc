import { EventDispatcher, Client, ClientOptions, Store } from "@kyudiscord/neo";
import type { Cluster } from "../cluster/Cluster";

export class ShardingManager extends EventDispatcher {
  /**
   * The path to the main file.
   */
  public readonly path: string;

  /**
   * Whether or not to run in a development environment.
   */
  public readonly development: boolean;

  /**
   * Cluster store.
   */
  public readonly clusters: Store<number, Cluster>;

  /**
   * The client to use.
   */
  public createClient: CreateClient;

  /**
   * The token to use when creating clients..
   */
  #token: string;

  /**
   * @param path 
   * @param options 
   */
  public constructor(path: string, options: SharderOptions) {
    super();

    this.path = path;
    this.development = options.development ?? false;
    this.clusters = new Store();
    this.#token = options.token;

    const createClient: CreateClient = (t, o) => new Client(t, o);
    this.createClient = options.createClient ?? createClient;
  }

  /**
   * The provided token.
   */
  public get token(): string {
    return this.#token;
  }
}

export type CreateClient = (token: string, options: ClientOptions) => Client;

export interface SharderOptions {
  token: string;
  shardCount?: number | "auto";
  clusterCount?: number;
  name?: string;
  development?: boolean;
  createClient?: CreateClient;
  guildsPreShard?: number;
  respawn?: boolean;
  ipcSocket?: string | number;
  timeout?: number;
  retry?: boolean;
  nodeArgs?: string[];
}
