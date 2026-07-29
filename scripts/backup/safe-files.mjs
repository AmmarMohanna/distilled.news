import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync
} from "node:fs";
import { resolve } from "node:path";

const noFollowFlag = typeof constants.O_NOFOLLOW === "number"
  ? constants.O_NOFOLLOW
  : 0;
const nonblockingFlag = typeof constants.O_NONBLOCK === "number"
  ? constants.O_NONBLOCK
  : 0;

export function openRegularFileForRead(path, {
  message,
  maxBytes = Number.MAX_SAFE_INTEGER
}) {
  const resolvedPath = resolve(path);
  let descriptor;
  try {
    descriptor = openSync(
      resolvedPath,
      constants.O_RDONLY | noFollowFlag | nonblockingFlag
    );
    const stat = fstatSync(descriptor, { bigint: true });
    const size = Number(stat.size);
    if (
      !stat.isFile() ||
      stat.size <= 0n ||
      stat.size > BigInt(maxBytes) ||
      !Number.isSafeInteger(size)
    ) {
      throw new Error(message);
    }
    return {
      descriptor,
      path: resolvedPath,
      size,
      identity: fileIdentity(stat)
    };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error instanceof Error && error.message === message) throw error;
    throw new Error(message, { cause: error });
  }
}

export function readRegularFileSnapshot(path, options) {
  const opened = openRegularFileForRead(path, options);
  try {
    const bytes = readFileSync(opened.descriptor);
    assertOpenFileUnchanged(opened, options.message);
    if (bytes.byteLength !== opened.size) {
      throw new Error(options.message);
    }
    return {
      bytes,
      path: opened.path,
      size: opened.size
    };
  } finally {
    closeSync(opened.descriptor);
  }
}

export function assertOpenFileUnchanged(opened, message) {
  const current = fstatSync(opened.descriptor, { bigint: true });
  if (
    !current.isFile() ||
    fileIdentity(current) !== opened.identity
  ) {
    throw new Error(message);
  }
}

function fileIdentity(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.nlink,
    stat.uid,
    stat.gid,
    stat.rdev,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs
  ].join(":");
}
