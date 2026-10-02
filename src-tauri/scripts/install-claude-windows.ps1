# Shared by native installation and the About page's copy command.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$stage = 'download'
$httpStatus = 0
$contentType = 'unknown'
$finalHost = 'unknown'
try {
    $response = Invoke-WebRequest -Uri 'https://claude.ai/install.ps1' -UseBasicParsing -TimeoutSec 60 -MaximumRedirection 5
    $httpStatus = [int]$response.StatusCode
    $finalUri = $response.BaseResponse.ResponseUri
    # PowerShell 7 exposes the effective URI on RequestMessage instead.
    if ($null -eq $finalUri) { $finalUri = $response.BaseResponse.RequestMessage.RequestUri }
    if ($null -ne $finalUri) { $finalHost = $finalUri.DnsSafeHost }
    $contentType = ([string]$response.Headers['Content-Type']).Split(';')[0].Trim().ToLowerInvariant()
    $stage = 'validate'
    if ($httpStatus -ne 200 -or $null -eq $finalUri -or $finalUri.Scheme -ne 'https') {
        throw 'Invalid installer response'
    }
    if ($contentType -notin @('text/plain', 'application/octet-stream', 'application/x-powershell', 'text/x-powershell')) {
        throw 'Unexpected installer content type'
    }
    $content = $response.Content
    if ($content -is [byte[]]) { $content = [System.Text.Encoding]::UTF8.GetString($content) }
    if ($content -isnot [string] -or [string]::IsNullOrWhiteSpace($content) -or $content.Length -gt 1048576) {
        throw 'Empty or oversized installer'
    }
    $content = $content.TrimStart([char]0xFEFF)
    # A proxy can label an HTML error page as text/plain. Reject markup/JSON
    # before parsing; an XML/HTML-looking PowerShell comment (<#) is permitted.
    if ($content -match '(?is)^\s*<(?!#)' -or
        $content -match '(?is)<(?:!doctype\s+html|html\b|head\b|body\b|script\b)') {
        throw 'Installer endpoint returned a document'
    }
    if ($content -match '^\s*[\[{]') {
        $isJson = $false
        try { $null = ConvertFrom-Json -InputObject $content -ErrorAction Stop; $isJson = $true } catch {}
        if ($isJson) { throw 'Installer endpoint returned JSON' }
    }
    $tokens = $null
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw 'Installer syntax invalid' }
    $installer = [scriptblock]::Create($content)
    $stage = 'execute'
    $global:LASTEXITCODE = 0
    & $installer
    if ($LASTEXITCODE -ne 0) { throw 'Installer failed' }
} catch {
    # Never print $_: it can contain the response body, script, URLs with query
    # credentials, or local account paths. Only bounded metadata is permitted.
    if ($contentType -notmatch '^[a-z0-9.+/-]{1,80}$') { $contentType = 'unknown' }
    if ($finalHost -notmatch '^[a-zA-Z0-9.-]{1,253}$') { $finalHost = 'unknown' }
    $code = switch ($stage) {
        'download' { 'INSTALL_DOWNLOAD_FAILED' }
        'validate' { 'INSTALL_INVALID_RESPONSE' }
        default { 'INSTALL_EXECUTION_FAILED' }
    }
    [Console]::Error.WriteLine(('[' + $code + '] HTTP={0}; Type={1}; Host={2}' -f $httpStatus, $contentType, $finalHost))
    exit 1
}
