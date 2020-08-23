import type { ShardUtil } from "./lib/shard/ShardUtil";

export * from "./lib/cluster/BaseCluster";
export * from "./lib/cluster/Cluster";

export * from "./lib/ipc/ClusterIPC";
export * from "./lib/ipc/MasterIPC";

export * from "./lib/shard/ShardingManager";
export * from "./lib/shard/ShardUtil";

export * from "./util/Util";
export * from "./util/constants";

declare module "@kyudiscord/neo" {
  interface Client {
    shard: ShardUtil<this>;
  }
}
