import asyncio
import socket

import httpcore
import pytest

from bench.network import PublicBackend


@pytest.mark.parametrize("failure", ["stall", "connect_error", "connect_timeout"])
def test_falls_back_to_validated_second_address(monkeypatch, failure):
    async def scenario():
        addresses = ["2001:67c:4e8:f004::9", "149.154.167.99"]
        calls = []
        async def lookup(*args, **kwargs):
            return [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", (a, 443)) for a in addresses]
        async def connect(self, host, port, timeout, local_address, socket_options):
            calls.append(host)
            assert port == 443 and local_address == "bind" and socket_options == []
            if host == addresses[0]:
                if failure == "stall": await asyncio.sleep(10)
                if failure == "connect_error": raise httpcore.ConnectError("unreachable")
                raise httpcore.ConnectTimeout("timeout")
            return "stream"
        monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", lookup)
        monkeypatch.setattr("bench.network.AutoBackend.connect_tcp", connect)
        monkeypatch.setattr(PublicBackend, "address_connect_seconds", 0.01)
        assert await PublicBackend().connect_tcp("t.me", 443, local_address="bind", socket_options=[]) == "stream"
        assert calls == addresses
    asyncio.run(scenario())


@pytest.mark.parametrize("cancel", [False, True])
def test_total_deadline_and_external_cancellation_do_not_start_fallback(monkeypatch, cancel):
    async def scenario():
        calls = []
        async def lookup(*args, **kwargs):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (a, 443)) for a in ["149.154.167.99", "93.184.216.34"]]
        started = asyncio.Event()
        async def connect(self, host, *args):
            calls.append(host)
            started.set()
            await asyncio.sleep(10)
        monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", lookup)
        monkeypatch.setattr("bench.network.AutoBackend.connect_tcp", connect)
        task = asyncio.create_task(PublicBackend().connect_tcp("t.me", 443, timeout=0.05))
        await started.wait()
        if cancel: task.cancel()
        with pytest.raises(asyncio.CancelledError if cancel else httpcore.ConnectTimeout):
            await task
        assert calls == ["149.154.167.99"]
    asyncio.run(scenario())


def test_all_addresses_fail(monkeypatch):
    async def scenario():
        calls = []
        async def lookup(*args, **kwargs):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (a, 443)) for a in ["149.154.167.99", "93.184.216.34"]]
        async def connect(self, host, *args):
            calls.append(host)
            raise httpcore.ConnectError("unreachable")
        monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", lookup)
        monkeypatch.setattr("bench.network.AutoBackend.connect_tcp", connect)
        with pytest.raises(httpcore.ConnectError):
            await PublicBackend().connect_tcp("t.me", 443)
        assert len(calls) == 2
    asyncio.run(scenario())
