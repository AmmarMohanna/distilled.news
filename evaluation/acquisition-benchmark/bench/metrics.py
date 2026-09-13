"""Host/process observations; no per-provider attribution under concurrent collection."""
import os
from pathlib import Path
import shutil
import time


def snapshot(data_dir):
    result = {"at": time.time(), "process_cpu_seconds": time.process_time(), "free_disk_bytes": shutil.disk_usage(data_dir).free,
              "scope": "dispatcher/host snapshot; concurrent jobs share these resources"}
    try:
        import resource
        result["peak_process_rss_kib"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        result["finished_children_cpu_seconds"] = os.times().children_user + os.times().children_system
        result["load_average"] = os.getloadavg()
    except (ImportError, OSError): pass
    try:
        values = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            if key in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}: values[key] = int(value.strip().split()[0]) * 1024
        result["host_memory_bytes"] = values
    except OSError: pass
    return result
