"""Host and process-tree observations; no per-provider attribution under concurrent collection."""
import os
from pathlib import Path
import shutil
import time

PROC = Path("/proc")


def process_group(command):
    name = command.lower()
    if "chrom" in name or "headless_shell" in name: return "chromium"
    if name.startswith("node"): return "node"
    if name.startswith("python"): return "python"
    return "other"


def process_tree(root_pid=None, proc=PROC, clock_ticks=None, page_size=None):
    """Sum RSS and CPU of the dispatcher and every descendant (Node bridge, Playwright, Chromium)."""
    root_pid = root_pid or os.getpid()
    ticks, page = clock_ticks or os.sysconf("SC_CLK_TCK"), page_size or os.sysconf("SC_PAGE_SIZE")
    parents, rows = {}, {}
    for entry in proc.iterdir():
        if not entry.name.isdigit(): continue
        try:
            stat = (entry / "stat").read_text()
            # comm is parenthesised and may contain spaces; fields after it are fixed.
            command = stat[stat.index("(") + 1:stat.rindex(")")]
            fields = stat[stat.rindex(")") + 2:].split()
            rss_pages = int((entry / "statm").read_text().split()[1])
        except (OSError, ValueError, IndexError):
            continue
        pid = int(entry.name)
        parents[pid] = int(fields[1])
        rows[pid] = {"group": process_group(command), "rss_bytes": rss_pages * page,
                     "cpu_seconds": (int(fields[11]) + int(fields[12])) / ticks}
    members, frontier = {root_pid}, [root_pid]
    while frontier:
        parent = frontier.pop()
        for pid, ppid in parents.items():
            if ppid == parent and pid not in members:
                members.add(pid); frontier.append(pid)
    groups = {}
    for pid in members & rows.keys():
        row = rows[pid]
        group = groups.setdefault(row["group"], {"processes": 0, "rss_bytes": 0, "cpu_seconds": 0.0})
        group["processes"] += 1
        group["rss_bytes"] += row["rss_bytes"]
        group["cpu_seconds"] += row["cpu_seconds"]
    return {"processes": sum(group["processes"] for group in groups.values()),
            "rss_bytes": sum(group["rss_bytes"] for group in groups.values()),
            "cpu_seconds": round(sum(group["cpu_seconds"] for group in groups.values()), 3), "groups": groups}


def host_cpu(proc=PROC):
    values = [int(value) for value in (proc / "stat").read_text().splitlines()[0].split()[1:]]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return {"busy": sum(values) - idle, "total": sum(values)}


def snapshot(data_dir):
    result = {"at": time.time(), "process_cpu_seconds": time.process_time(), "free_disk_bytes": shutil.disk_usage(data_dir).free,
              "scope": "host plus dispatcher process tree; concurrent jobs share these resources"}
    try:
        import resource
        result["peak_process_rss_kib"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        result["load_average"] = os.getloadavg()
    except (ImportError, OSError): pass
    try:
        values = {}
        for line in (PROC / "meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            if key in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}: values[key] = int(value.strip().split()[0]) * 1024
        result["host_memory_bytes"] = values
        result["host_cpu_jiffies"] = host_cpu()
        result["process_tree"] = process_tree()
    except (OSError, ValueError, AttributeError): pass
    return result


def cpu_fraction(previous, current):
    """Busy share of host CPU between two snapshots, or None when unavailable."""
    before, after = (previous or {}).get("host_cpu_jiffies"), (current or {}).get("host_cpu_jiffies")
    if not before or not after or after["total"] <= before["total"]: return None
    return (after["busy"] - before["busy"]) / (after["total"] - before["total"])


def summarize(samples):
    summary = {"samples": len(samples), "process_tree_supported": any("process_tree" in sample for sample in samples)}
    trees = [sample["process_tree"] for sample in samples if "process_tree" in sample]
    if trees:
        summary["peak_tree_rss_bytes"] = max(tree["rss_bytes"] for tree in trees)
        summary["max_tree_cpu_seconds"] = max(tree["cpu_seconds"] for tree in trees)
        for group in ("python", "node", "chromium", "other"):
            summary[f"peak_{group}_rss_bytes"] = max(tree["groups"].get(group, {}).get("rss_bytes", 0) for tree in trees)
    available = [sample["host_memory_bytes"]["MemAvailable"] for sample in samples if "MemAvailable" in sample.get("host_memory_bytes", {})]
    if available: summary["min_available_memory_bytes"] = min(available)
    swap = [sample["host_memory_bytes"]["SwapTotal"] - sample["host_memory_bytes"]["SwapFree"] for sample in samples
            if {"SwapTotal", "SwapFree"} <= sample.get("host_memory_bytes", {}).keys()]
    if swap: summary["peak_swap_used_bytes"] = max(swap)
    fractions = [value for value in (cpu_fraction(left, right) for left, right in zip(samples, samples[1:])) if value is not None]
    if fractions: summary["max_host_cpu_fraction"] = round(max(fractions), 4)
    return summary
