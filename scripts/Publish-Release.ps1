[CmdletBinding()]
param([Parameter(Mandatory)][string]$NotesPath)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$name = 'SunshiineDolly/Viddy'
$api = "https://api.github.com/repos/$name"
$version = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
$tag = "v$version"
$bundle = Join-Path $repo 'src-tauri/target/release/bundle/nsis'
$appName = (Get-Content (Join-Path $repo 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json).productName
$installer = "${appName}_${version}_x64-setup.exe"
$files = @($installer, "$installer.sig", 'latest.json', 'SHA256SUMS.txt')
$manifest = Get-Content (Join-Path $bundle 'latest.json') -Raw | ConvertFrom-Json
. (Join-Path $PSScriptRoot 'Release-Platforms.ps1')
Assert-ReleasePlatforms -Manifest $manifest
$artifact = $manifest.platforms.'windows-x86_64'
if ($manifest.version -cne $version -or $artifact.url -cne "https://github.com/$name/releases/download/$tag/$installer" -or $artifact.signature -cne (Get-Content (Join-Path $bundle "$installer.sig") -Raw).Trim() -or (Get-Item (Join-Path $bundle $installer)).VersionInfo.ProductVersion -cne $version) { throw 'Version, updater manifest, signature, or installer mismatch' }
$macPlatforms = @($manifest.platforms.PSObject.Properties.Name | Where-Object { $_ -like 'darwin-*' })
if ($macPlatforms.Count) {
    $macArchive = "Viddy_${version}_universal.app.tar.gz"
    $macDmg = "Viddy_${version}_universal.dmg"
    $macSig = (Get-Content -LiteralPath (Join-Path $bundle "$macArchive.sig") -Raw).Trim()
    foreach ($target in @('darwin-aarch64', 'darwin-x86_64')) {
        $item = $manifest.platforms.$target
        if (!$macSig -or $item.url -cne "https://github.com/$name/releases/download/$tag/$macArchive" -or $item.signature -cne $macSig) { throw "Mac updater manifest mismatch for $target" }
    }
    $files += @($macDmg, $macArchive, "$macArchive.sig")
}
$checksums = foreach ($file in $files | Where-Object { $_ -ne 'SHA256SUMS.txt' }) { (Get-FileHash -LiteralPath (Join-Path $bundle $file) -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $file }
[IO.File]::WriteAllText((Join-Path $bundle 'SHA256SUMS.txt'), ($checksums -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
$notes = Get-Content -LiteralPath $NotesPath -Raw
function Git([string[]]$Arguments) {
    $result = & git.exe -C $repo @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git operation failed: $($Arguments[0])" }
    return $result
}
if (@(Git @('status','--porcelain')).Count) { throw 'Commit the intended source and release notes before publishing' }
$head = (Git @('rev-parse','HEAD')).Trim()
$committedVersion = ((Git @('show','HEAD:package.json')) -join "`n" | ConvertFrom-Json).version
if ($committedVersion -cne $version) { throw 'Committed source has a different version' }
$headers = @{}
$credential = @{}
function Request($Method, $Uri, $Body=$null) {
    if (([uri]$Uri).Host -cne 'api.github.com' -or ([uri]$Uri).Scheme -cne 'https') { throw 'Unexpected GitHub API endpoint' }
    if ($null -eq $Body) { return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -TimeoutSec 60 }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 10) -TimeoutSec 60
}
try {
    $env:GCM_INTERACTIVE = 'Never'
    $lines = "protocol=https`nhost=github.com`nusername=SunshiineDolly`n`n" | & git.exe -c credential.interactive=never credential fill
    if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in is required' }
    foreach ($line in $lines) { if ($line -match '^([^=]+)=(.*)$') { $credential[$Matches[1]]=$Matches[2] } }
    if (!$credential.password) { throw 'No publishing credential was available' }
    $headers = @{Authorization="Bearer $($credential.password)";Accept='application/vnd.github+json';'User-Agent'='Viddy-release-publisher';'X-GitHub-Api-Version'='2026-03-10'}
    $account = Request Get 'https://api.github.com/user'
    if ($account.login -cne 'SunshiineDolly' -or [string]$account.id -cne '349487638') { throw 'The publishing account must be SunshiineDolly' }
    $metadata = Request Get $api
    if ($metadata.full_name -cne $name -or $metadata.private -or !$metadata.permissions.push) { throw 'Expected the public Viddy release repository and write access' }
    $existingTags = @(Git @('tag','--list',$tag))
    if ($existingTags.Count) { if ((Git @('rev-parse',$tag)).Trim() -cne $head) { throw 'The version tag already targets a different source commit' } }
    else { $null = Git @('tag',$tag,$head) }
    $null = Git @('push',"https://SunshiineDolly@github.com/$name.git","refs/tags/$tag")
    $releases = @(Request Get "$api/releases?per_page=100")
    $newer = @($releases | Where-Object { !$_.draft -and $_.tag_name -match '^v\d+\.\d+\.\d+$' -and [version]$_.tag_name.Substring(1) -gt [version]$version })
    if ($newer.Count) { throw 'A newer release already exists; Latest was not changed' }
    $existing = @($releases | Where-Object tag_name -CEQ $tag)
    if ($existing.Count -gt 1) { throw 'Duplicate releases for one version' }
    $release = if ($existing.Count) { $existing[0] } else { Request Post "$api/releases" @{tag_name=$tag;target_commitish=$head;name="$appName $version";body=$notes;draft=$true;prerelease=$false} }
    if (@($release.assets | Where-Object name -NotIn $files).Count) { throw 'Unexpected assets on this release; nothing was removed' }
    foreach ($file in $files) {
        if ($file -in @($release.assets.name)) { continue }
        $upload = [uri]($release.upload_url.Split('{')[0])
        if ($upload.Scheme -cne 'https' -or $upload.Host -cne 'uploads.github.com' -or $upload.AbsolutePath -cne "/repos/$name/releases/$($release.id)/assets") { throw 'Unexpected asset upload destination' }
        $null = Invoke-RestMethod -Method Post -Uri ($upload.AbsoluteUri + '?name=' + [uri]::EscapeDataString($file)) -Headers $headers -ContentType 'application/octet-stream' -InFile (Join-Path $bundle $file) -TimeoutSec 120
    }
    $release = Request Get "$api/releases/$($release.id)"
    if (@($release.assets).Count -ne $files.Count) { throw 'Release assets are incomplete' }
    foreach ($asset in $release.assets) {
        $local = Get-Item -LiteralPath (Join-Path $bundle $asset.name)
        $hash = (Get-FileHash -LiteralPath $local.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($asset.state -cne 'uploaded' -or $asset.size -ne $local.Length -or $asset.digest -cne "sha256:$hash") { throw "Asset verification failed: $($asset.name)" }
    }
    $null = Request Patch "$api/releases/$($release.id)" @{draft=$false;make_latest='true'}
    $latest = Request Get "$api/releases/latest"
    if ($latest.tag_name -cne $tag -or $latest.draft) { throw 'Latest release verification failed' }
    Write-Output "Published and checksum-verified $($latest.html_url)"
}
finally {
    $headers.Clear()
    $credential.Clear()
    $lines = $null
    Remove-Item Env:GCM_INTERACTIVE -ErrorAction SilentlyContinue
}
