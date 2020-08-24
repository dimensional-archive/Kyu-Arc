import { Client as DiscordClient, Client, EventDispatcher } from "@kyudiscord/neo";
import { Client as VezaClient, ClientSocket, NodeMessage } from "veza";
import { IPCEvent, makeError } from "../../util";

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
    this.client = new VezaClient(`cluster-${id}`)
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
  public async broadcast<T>(script: EvalScript): Promise<T[]> {
    script = typeof script === "function"
      ? `(${script})(this)`
      : script;

    const { success, d } = await this.server.send({
      op: IPCEvent.BROADCAST,
      d: script
    }) as IPCResult;

    if (!success) throw makeError(d as IPCError);
    return d as T[];
  }

  /**
   * Evaluates a script on the master process.
   * @param script The script to evaluate.
   */
  public async masterEval<T>(script: EvalScript): Promise<T> {
    script = typeof script === "function"
      ? `(${script})(this)`
      : script;

    const { success, d } = await this.server.send({
      op: IPCEvent.MASTER_EVAL,
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
    return this.discord.eval(script);
  }

  /**
   * Called whenever the veza client receives a message.
   * @param msg The received message.
   */
  private async _message(msg: NodeMessage): Promise<void> {
    const { op, d } = msg.data;
    if (op === IPCEvent.EVAL) {
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

export type EvalScript = string | ((this: Client, ...args: unknown[]) => unknown | Promise<unknown[]>)

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
