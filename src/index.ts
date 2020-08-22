import type { ShardUtil } from "./lib/shard/ShardUtil";

declare module "@kyudiscord/neo" {
  interface Client {
    shard: ShardUtil<this>;
  }
}