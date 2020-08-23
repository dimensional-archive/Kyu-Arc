import { EventDispatcher } from "@kyudiscord/neo";
import { NodeMessage, Server } from "veza";
import { isMaster } from "cluster";
import { ErrorObject, IPCEvent, makeError, SharderEvent } from "../../util";

import type { ShardingManager } from "../shard/ShardingManager";
import type { EvalScript, IPCRequest, IPCResult } from "./ClusterIPC";

export class MasterIPC extends EventDispatcher {
  /**
   * The sharding manager.
   */
  public readonly manager: ShardingManager

  /**
   * The IPC Server.
   */
  public readonly server: Server;

  /**
   * @param manager
   */
  public constructor(manager: ShardingManager) {
    super();

    this.manager = manager;
    this.server = new Server("master");
    this._init();
  }

  /**
   * Broadcasts a script to every cluster.
   * @param script The script to broadcast.
   */
  public async broadcast<T = unknown>(script: EvalScript): Promise<T[]> {
    script = typeof script === "function"
      ? `(${script})(this)`
      : script;

    const data = await this.server.broadcast({
      op: IPCEvent.EVAL,
      d: script
    }) as IPCResult[];

    const errored = data.filter(r => !r.success);
    if (errored.length) {
      const errors = errored.map(e => e.d) as ErrorObject[];
      throw makeError(errors[0]);
    }

    return data.map(r => r.d) as T[];
  }

  /**
   * @private
   */
  private _message(message: NodeMessage) {
    const { op } = message.data as IPCRequest;

    const _handlers: Record<number, (message: NodeMessage) => unknown> = {
      [IPCEvent.BROADCAST]: this._broadcast.bind(this),
      [IPCEvent.MASTER_EVAL]: this._masterEval.bind(this),
      [IPCEvent.RESTART]: this._restart.bind(this),
      [IPCEvent.RESTART_ALL]: this._restartAll.bind(this),
      [IPCEvent.READY]: this._ready.bind(this),
      [IPCEvent.SHARD_READY]: this._shardReady.bind(this),
      [IPCEvent.SHARD_DISCONNECT]: this._shardDisconnect.bind(this),
      [IPCEvent.SHARD_RECONNECT]: this._shardReconnect.bind(this),
      [IPCEvent.SHARD_RESUME]: this._shardResume.bind(this),
      [IPCEvent.FETCH_CHANNEL]: this._fetchChannel.bind(this),
      [IPCEvent.FETCH_GUILD]: this._fetchGuild.bind(this),
      [IPCEvent.FETCH_USER]: this._fetchUser.bind(this),
    };

    _handlers[op](message);
  }

  /**
   * @private
   */
  private async _broadcast(message: NodeMessage): Promise<void> {
    const { d } = message.data as IPCRequest;

    try {
      const res = await this.broadcast(d);
      message.reply({ success: true, d: res });
    } catch (e) {
      const err = { name: e.name, message: e.message, stack: e.stack };
      message.reply({ success: false, d: err });
    }

    return;
  }

  /**
   * Called whenever a cluster is ready.
   * @private
   */
  private _ready({ data }: NodeMessage) {
    const cluster = this.manager.clusters.get(data.d);
    if (cluster) {
      cluster.emit("ready");
      this.emit("debug", `Cluster ${cluster.id} became ready.`);
      this.manager.emit(SharderEvent.READY, cluster.id);
    }

    return;
  }

  /**
   * Called whenever a shard is ready.
   * @private
   */
  private _shardReady({ data: { d } }: NodeMessage) {
    this.emit("debug", `Shard ${d.shardId} became ready.`);
    return this.manager.emit(SharderEvent.SHARD_READY, d.shardId);
  }

  /**
   * Called whenever a shard reconnects.
   * @private
   */
  private _shardReconnect({ data: { d } }: NodeMessage) {
    this.emit("debug", `Shard ${d.shardId} tries to reconnect`);
    this.manager.emit(SharderEvent.SHARD_RECONNECT, d.shardId);
  }

  /**
   * Called whenever a shard is resumed.
   * @private
   */
  private _shardResume({ data: { d } }: NodeMessage) {
    this.emit("debug", `Shard ${d.shardId} resumed connection`);
    this.manager.emit(SharderEvent.SHARD_RESUME, d.shardId, d.replayed);
  }

  /**
   * Called whenever a shard disconnects.
   * @private
   */
  private _shardDisconnect({ data: { d } }: NodeMessage) {
    this.emit("debug", `Shard ${d.shardId} disconnected!`);
    this.manager.emit(SharderEvent.SHARD_DISCONNECT, d.shardId, d.closeEvent);
  }

  /**
   * Called whenever a cluster requests to get restarted.
   * @private
   */
  private _restart(message: NodeMessage) {
    const { d: clusterID } = message.data;
    return this.manager.restart(clusterID)
      .then(() => message.reply({ success: true }))
      .catch(e => message.reply({ success: false, d: e }));
  }

  /**
   * Called whenever a shard wants to evaluate something on the master process.
   * @private
   */
  private async _masterEval(message: NodeMessage) {
    const { d } = message.data;

    try {
      const result = await this.manager.eval(d);
      return message.reply({ success: true, d: result });
    } catch (error) {
      return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
    }
  }

  /**
   * Called whenever a cluster wants to restart all shards.
   * @private
   */
  private async _restartAll() {
    await this.manager.respawnAll();
  }

  /**
   * Called whenever a shard fetches a user.
   * @private
   */
  private async _fetchUser(message: NodeMessage) {
    return this._fetch(message, "const user = this.users.get('{id}'); user ? user.toJSON() : user;");
  }

  /**
   * Called whenever shard fetches a guild.
   * @private
   */
  private async _fetchGuild(message: NodeMessage) {
    return this._fetch(message, "const guild = this.guilds.get('{id}'); guild ? guild.toJSON() : guild;");
  }

  /**
   * Called whenever a shard fetches a channel.
   * @private
   */
  private _fetchChannel(message: NodeMessage) {
    return this._fetch(message, "const channel = this.channels.get('{id}'); channel ? channel.toJSON() : channel;");
  }

  /**
   * @private
   */
  private async _fetch(message: NodeMessage, code: string) {
    const { d: id } = message.data;
    const result = await this.broadcast(code.replace("{id}", id));
    const realResult = result.filter(r => r);

    return realResult.length
      ? message.reply({ success: true, d: realResult[0] })
      : message.reply({ success: false });
  }

  /**
   * Initializes the master ipc.
   * @private
   */
  private _init() {
    this.server
      .on("connect", c => this.emit("debug", `Client Connect: ${c.name}`))
      .on("disconnect", c => this.emit("debug", `Client Disconnect: ${c.name}`))
      .on("error", e => this.emit("error", e))
      .on("message", this._message.bind(this));

    if (isMaster) {
      this.server.listen(this.manager.ipcSocket)
        .catch((e) => {
          this.emit("error", e);
        });
    }
  }
}