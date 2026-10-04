#!/usr/bin/env python3
"""Write the local nick file and register the Nova MCP server with Codex and omp."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nova_proto import save_client

SCRIPT = Path(__file__).resolve().parent / "nova-mcp.py"
CODEX = Path.home() / ".codex" / "config.toml"
OMP = Path.home() / ".omp" / "agent" / "mcp.json"


def codex_block(host):
    return f"""
[mcp_servers.nova]
command = "python3"
args = ["{SCRIPT}"]
startup_timeout_sec = 20
tool_timeout_sec = 120

[mcp_servers.nova.env]
NOVA_HOST = "{host}"
"""


def register_codex(host):
    if not CODEX.exists():
        return "codex config not found"
    text = CODEX.read_text()
    if "[mcp_servers.nova]" in text:
        return "codex already registered"
    CODEX.write_text(text.rstrip() + "\n" + codex_block(host))
    return "codex registered"


def register_omp(host, nick):
    if not OMP.exists():
        return "omp config not found"
    data = json.loads(OMP.read_text())
    data.setdefault("mcpServers", {})
    data["mcpServers"]["nova"] = {
        "type": "stdio",
        "command": "python3",
        "args": [str(SCRIPT)],
        "timeout": 120000,
        "env": {"NOVA_HOST": host, "NOVA_NICK": nick},
    }
    OMP.write_text(json.dumps(data, indent=2) + "\n")
    return "omp registered"


def main():
    parser = argparse.ArgumentParser(description="Register Nova hub MCP")
    parser.add_argument("--nick", required=True)
    parser.add_argument("--host", default="172.16.13.172")
    args = parser.parse_args()
    save_client(args.host, args.nick)
    print(register_codex(args.host))
    print(register_omp(args.host, args.nick))
    print("Restart Codex and omp so they load the nova MCP server.")
    print("Then use nova_wait and nova_say. Do not start a second listener nick.")


if __name__ == "__main__":
    main()
