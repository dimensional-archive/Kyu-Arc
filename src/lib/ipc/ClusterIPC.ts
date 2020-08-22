import { EventDispatcher, Client as DiscordClient } from "@kyudiscord/neo";
import { ClientSocket, Client as VezaClient, NodeMessage } from "veza";
import { createContext, runInContext } from "vm";
import { IPCEvents } from "../../util/constants";
import { makeError } from "../../util/Util";

export class ClusterIPC<C extends DiscordClient> extends EventDispatcher {
  public readonly discord: C;

  /**
   * The veza
   */
  public readonly client: VezaClient;

  /**
   * The cluster id.
   */
  public id: number;

  /**
   * The socket to use.
   */
  public socket: string | number;

  /**
   * The ipc socket.
   */
  private clientSocket?: ClientSocket;

  /**
   * @param discord The discord client.
   * @param id The cluster id.
   * @param socket The socket.
   */
  public constructor(discord: C, id: number, socket: string | number) {
    super();

    this.id = id;
    this.socket = socket;

    this.discord = discord;
    this.client = new VezaClient(`Cluster ${id}`)
      .on("error", e => this.emit("error", e))
      .on("disconnect", c => this.emit("warn", `[IPC] Disconnected from ${c.name}`))
      .on("ready", c => this.emit("debug", `[IPC] Connected to: ${c.name}`))
      .on("message", this._message.bind(this));
  }

  /**
   * Returns the client socket.
   */
  public get server(): ClientSocket {
    return this.clientSocket!;
  }

  /**
   * Initializes the client socket.
   */
  public async init(): Promise<void> {
    this.clientSocket = await this.client.connectTo(String(this.socket));
  }

  /**
   * Broadcasts a script to all clusters.
   * @param script The script to broadcast.
   */
  public async broadcast<T>(script: string | CallableFunction): Promise<T[]> {
    script = typeof script === "function"
      ? `(${script})(this)`
      : script;

    const { success, d } = await this.server.send({
      op: IPCEvents.BROADCAST,
      d: script
    }) as IPCResult;

    if (!success) throw makeError(d as IPCError);
    return d as T[];
  }

  /**
   * Evaluates a script on the master process.
   * @param script The script to evaluate.
   */
  public async masterEval<T>(script: string | CallableFunction): Promise<T> {
    script = typeof script === "function"
      ? `(${script})(this)`
      : script;

    const { success, d } = await this.server.send({
      op: IPCEvents.MASTER_EVAL,
      d: script
    }) as IPCResult;

    if (!success) throw makeError(d as IPCError);
    return d as T;
  }

  /**
   * Evaluates code.
   * @param script The code to evaluate.
   */
  private _eval(script: string): unknown {
    const context = createContext({ "this": this.discord });
    return runInContext(script, context);
  }

  /**
   * Called whenever the veza client receives a message.
   * @param msg The received message.
   */
  private async _message(msg: NodeMessage): Promise<void> {
    const { op, d } = msg.data;
    if (op === IPCEvents.EVAL) {
      let evaluated;
      try {
        evaluated = await this._eval(d);
      } catch (e) {
        return msg.reply({
          success: false,
          d: { name: e.name, stack: e.stack, message: e.message }
        });
      }

      msg.reply({ success: true, d: evaluated });
    }
  }
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
