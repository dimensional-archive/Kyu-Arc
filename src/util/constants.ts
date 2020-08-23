export enum IPCEvent {
  EVAL,
  MESSAGE,
  BROADCAST,
  READY,
  SHARD_READY,
  SHARD_RECONNECT,
  SHARD_RESUME,
  SHARD_DISCONNECT,
  MASTER_EVAL,
  RESTART_ALL,
  RESTART,
  FETCH_USER,
  FETCH_CHANNEL,
  FETCH_GUILD
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