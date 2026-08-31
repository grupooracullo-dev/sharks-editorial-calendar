param(
  [Parameter(Mandatory=$true)][string]$Ref,
  [Parameter(Mandatory=$true)][string]$Token,
  [Parameter(Mandatory=$true)][string]$Slug,
  [Parameter(Mandatory=$true)][string]$BaseDir,
  [Parameter(Mandatory=$true)][string[]]$Files,
  [bool]$VerifyJwt = $false
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromMinutes(5)
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $Token)

$entry = ($Files | Where-Object { $_ -match '(^|[\\/])index\.ts$' } | Select-Object -First 1)
$meta = @{ entrypoint_path = $entry; verify_jwt = $VerifyJwt } | ConvertTo-Json -Compress

$content = New-Object System.Net.Http.MultipartFormDataContent
$metaContent = New-Object System.Net.Http.StringContent($meta, [System.Text.Encoding]::UTF8, "application/json")
$content.Add($metaContent, "metadata")

foreach ($rel in $Files) {
  $abs = Join-Path $BaseDir $rel
  $bytes = [System.IO.File]::ReadAllBytes($abs)
  $bc = New-Object System.Net.Http.ByteArrayContent(,$bytes)
  $content.Add($bc, "file", ($rel -replace '\\','/'))
}

$uri = "https://api.supabase.com/v1/projects/$Ref/functions/deploy?slug=$Slug"
$resp = $client.PostAsync($uri, $content).Result
$body = $resp.Content.ReadAsStringAsync().Result
"STATUS: $([int]$resp.StatusCode)"
$body
