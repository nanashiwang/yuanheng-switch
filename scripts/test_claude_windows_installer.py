"""Run the real checked script against mocked responses, never a real installer.
Usage: python3 scripts/test_claude_windows_installer.py /path/to/pwsh
PowerShell 5.1 on Windows: pass the path to powershell.exe.
"""
import base64
import pathlib
import subprocess
import sys
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
script = (root / "src-tauri/scripts/install-claude-windows.ps1").read_text()
valid = "[CmdletBinding()] param()\nSet-Content -LiteralPath $env:INSTALL_TEST_MARKER -Value safe"
cases = [
    ("valid", valid, "text/plain", "https://claude.ai/install.ps1", 200, "", True),
    ("binary-mime", valid, "application/octet-stream", "https://claude.ai/install.ps1", 200, "", True),
    ("bom", "\ufeff" + valid, "text/plain; charset=utf-8", "https://claude.ai/install.ps1", 200, "", True),
    ("html", "<!DOCTYPE html><script>var x=1</script>", "text/html", "https://claude.ai/error?token=PRIVATE", 200, "INSTALL_INVALID_RESPONSE", False),
    ("mislabelled-html", "<html><script>var x=1</script></html>", "text/plain", "https://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
    ("json", '{"error":"PRIVATE"}', "text/plain", "https://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
    ("json-array", '["PRIVATE"]', "text/plain", "https://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
    ("xml", '<?xml version="1.0"?><error>PRIVATE</error>', "application/octet-stream", "https://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
    ("empty", " ", "text/plain", "https://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
    ("syntax", "param(\nPRIVATE", "text/plain", "https://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
    ("downgrade", valid, "text/plain", "http://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
    ("status", valid, "text/plain", "https://claude.ai/install.ps1", 403, "INSTALL_INVALID_RESPONSE", False),
    ("execution", "throw 'PRIVATE'", "text/plain", "https://claude.ai/install.ps1", 200, "INSTALL_EXECUTION_FAILED", False),
    ("download", "PRIVATE", "text/plain", "https://claude.ai/install.ps1", 0, "INSTALL_DOWNLOAD_FAILED", False),
    ("oversized", "#" + "x" * 1048576, "text/plain", "https://claude.ai/install.ps1", 200, "INSTALL_INVALID_RESPONSE", False),
]
with tempfile.TemporaryDirectory(prefix="yh-script-test-") as tmp:
    tmp = pathlib.Path(tmp)
    for name, body, mime, uri, status, error, executed in cases:
        body_path = tmp / "response.txt"
        body_path.write_text(body, encoding="utf-8")
        marker = tmp / "executed.txt"
        marker.unlink(missing_ok=True)
        mock = f"""
$env:INSTALL_TEST_MARKER = '{str(marker).replace(chr(39), chr(39)*2)}'
function Invoke-WebRequest {{
    if ({status} -eq 0) {{ throw 'PRIVATE download failure' }}
    [pscustomobject]@{{StatusCode={status}; Headers=@{{'Content-Type'='{mime}'}};
    BaseResponse=[pscustomobject]@{{ResponseUri=[uri]'{uri}'}};
    Content=[System.IO.File]::ReadAllText('{str(body_path).replace(chr(39), chr(39)*2)}')}}
}}
"""
        # Source is intentionally encoded just as production uses it.
        encoded = base64.b64encode((mock + script).encode("utf-16-le")).decode()
        result = subprocess.run([sys.argv[1], "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                                capture_output=True, text=True, timeout=20)
        assert result.returncode == (0 if executed else 1), (name, result.returncode, result.stderr)
        assert marker.exists() == executed, name
        if error:
            assert "[" + error + "]" in result.stderr, (name, result.stderr)
            assert "PRIVATE" not in result.stderr, (name, result.stderr)
            assert "CLIXML" not in result.stderr, (name, result.stderr)
            assert len(result.stderr) < 500, (name, len(result.stderr))
        print("PASS", name)
print(f"{len(cases)} real PowerShell cases passed; no network/real installation.")
