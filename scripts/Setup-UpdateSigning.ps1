[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$directory = Join-Path $env:LOCALAPPDATA 'PureTube\signing'
$key = Join-Path $directory 'updater.key'
$passwordFile = Join-Path $directory 'password.dpapi'
if ((Test-Path -LiteralPath $key) -xor (Test-Path -LiteralPath $passwordFile)) { throw 'Signing credentials are incomplete; existing credentials were not overwritten.' }
if (!(Test-Path -LiteralPath $key)) {
    $null = New-Item -ItemType Directory -Force -Path $directory
    $acl = Get-Acl -LiteralPath $directory
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.SetAccessRule($rule)
    }
    Set-Acl -LiteralPath $directory -AclObject $acl
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $secure = ConvertTo-SecureString $password -AsPlainText -Force
    try {
        # Persist the password using Windows DPAPI, never in the source or logs.
        [IO.File]::WriteAllText($passwordFile, ($secure | ConvertFrom-SecureString))
        Push-Location -LiteralPath $repo
        try {
            $output = & npm.cmd run tauri signer generate -- --ci -p $password -w $key 2>&1
            if ($LASTEXITCODE -ne 0) { throw 'Tauri could not generate the update-signing key.' }
        } finally { Pop-Location }
    } finally {
        $password = $null
        $output = $null
        $secure.Dispose()
    }
}
if (!(Test-Path -LiteralPath ($key + '.pub'))) { throw 'The matching public key is missing.' }
$publicDestination = Join-Path $repo 'src-tauri\updater-public-key.pub'
$publicKey = (Get-Content -LiteralPath ($key + '.pub') -Raw).Trim()
if ((Test-Path -LiteralPath $publicDestination) -and (Get-Content -LiteralPath $publicDestination -Raw).Trim() -cne $publicKey) { throw 'The repository has a different trusted public key. It was not changed.' }
[IO.File]::WriteAllText($publicDestination, $publicKey + "`n", [Text.UTF8Encoding]::new($false))
Write-Output 'Update-signing credentials are protected for this Windows account outside the repository.'
Write-Output "Public key: $publicDestination"
