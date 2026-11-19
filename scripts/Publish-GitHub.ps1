[CmdletBinding()]
param([switch]$PrepareOnly, [string]$ResumeFrom)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$owner = 'SunshiineDolly'
$repository = "$owner/PureTube"
$api = "https://api.github.com/repos/$repository"
$bundle = Join-Path $workspace 'src-tauri/target/release/bundle/nsis'
$work = if ($ResumeFrom) { (Resolve-Path -LiteralPath $ResumeFrom).Path } else { Join-Path $workspace ('src-tauri/target/github-publish-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
if (!$work.StartsWith((Join-Path $workspace 'src-tauri\target\github-publish-'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected publishing workspace' }
if (!$ResumeFrom) { $null = New-Item -ItemType Directory -Path $work }
$utf8 = [System.Text.UTF8Encoding]::new($false)
function Write-Text($Path, $Content) {
    $null = New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}
function Git-At($Directory, [string[]]$Arguments) {
    $result = & git -C $Directory @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git operation failed: $($Arguments[0])" }
    return $result
}
function Commit-Snapshot($Directory, $Message) {
    $null = Git-At $Directory @('init', '-b', 'main')
    $null = Git-At $Directory @('add', '--all')
    $null = Git-At $Directory @('-c', 'user.name=SunshiineDolly', '-c', 'user.email=349487638+SunshiineDolly@users.noreply.github.com', 'commit', '-m', $Message)
    return (Git-At $Directory @('rev-parse', 'HEAD')).Trim()
}
$latest = (Get-Content (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json).version
$source = Join-Path $work 'source'
if (!$ResumeFrom) {
$null = New-Item -ItemType Directory -Path $source
$files = Git-At $workspace @('ls-files', '--cached', '--others', '--exclude-standard')
foreach ($relative in $files) {
    if ($relative -match '(^|/)(\.git|node_modules|target|dist|\.env[^/]*)(/|$)|client_secret|\.(sqlite3?|pem|p8|key)$') { throw "Unexpected source path: $relative" }
    $destination = Join-Path $source $relative
    $null = New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent)
    Copy-Item -LiteralPath (Join-Path $workspace $relative) -Destination $destination
}
$plan = @(Get-ChildItem -LiteralPath $bundle -Filter 'PureTube_*-setup.exe' | ForEach-Object {
    if ($_.Name -notmatch '^PureTube_(\d+\.\d+\.\d+)_x64-setup\.exe$') { throw 'Unexpected installer filename' }
    $version = $Matches[1]
    if ($_.VersionInfo.ProductVersion -cne $version -or $_.VersionInfo.FileVersion -cne $version) { throw "Wrong embedded version: $($_.Name)" }
    [pscustomobject]@{version=$version;tag="v$version";installer=$_.Name;size=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();source= $(if ($version -eq $latest -or $version -in @('0.1.1','0.1.2')) {'retained'} else {'not-retained'});commit=''}
} | Sort-Object { [version]$_.version })
if (!$plan.Count -or $latest -notin $plan.version) { throw 'The latest installer is missing' }
Write-Text (Join-Path $source 'releases/index.json') (($plan | Select-Object version,tag,installer,size,sha256,source | ConvertTo-Json -Depth 5) + "`n")
$releaseReadme = @'
# PureTube releases

Windows installers are available in GitHub Releases, with one release per embedded application version. The newest version is marked Latest. Verify downloads using each release's SHA256SUMS.txt.

The main branch contains the current source. Exact source snapshots were retained for 0.1.1, 0.1.2, and 0.9.0. Other historical tags contain archival release metadata only; their automatically generated GitHub source archives do not contain application source. Their original Windows installers remain available as release assets.

The ordinary installers use manual upgrades. No signed auto-update manifest is published by this script.
'@
Write-Text (Join-Path $source 'releases/README.md') ($releaseReadme + "`n")
$head = Commit-Snapshot $source "Publish PureTube $latest source and versioned release catalog"
foreach ($item in $plan) {
    if ($item.version -eq $latest) { $item.commit = $head }
    else {
        $snapshot = Join-Path $work $item.tag
        $null = New-Item -ItemType Directory -Path $snapshot
        if ($item.source -eq 'retained') {
            $revision = if ($item.version -eq '0.1.1') {'559efa9'} else {'a9469e5'}
            $archive = Join-Path $work ($item.tag + '.zip')
            $null = Git-At $workspace @('archive', '--format=zip', "--output=$archive", $revision)
            Expand-Archive -LiteralPath $archive -DestinationPath $snapshot
            if ((Get-Content (Join-Path $snapshot 'package.json') -Raw | ConvertFrom-Json).version -cne $item.version) { throw 'Historical source version mismatch' }
        }
        else {
            Write-Text (Join-Path $snapshot 'RELEASE.md') "# PureTube $($item.version)`n`nArchival Windows installer: $($item.installer).`n`nThe exact application source snapshot for this historical build was not retained. This tag contains release metadata only; use the installer attached to the GitHub release. Current application source is on the main branch.`n`nSHA-256: $($item.sha256)`n"
        }
        $item.commit = Commit-Snapshot $snapshot "Archive PureTube $($item.version)"
        $null = Git-At $source @('fetch', $snapshot, 'main')
    }
    $null = Git-At $source @('tag', $item.tag, $item.commit)
    $itemDirectory = Join-Path $work ('assets/' + $item.tag)
    $null = New-Item -ItemType Directory -Path $itemDirectory
    Write-Text (Join-Path $itemDirectory 'SHA256SUMS.txt') "$($item.sha256)  $($item.installer)`n"
}
Write-Text (Join-Path $work 'plan.json') (($plan | ConvertTo-Json -Depth 5) + "`n")
} else {
    $plan = @(Get-Content (Join-Path $work 'plan.json') -Raw | ConvertFrom-Json)
    foreach ($item in $plan) {
        $file = Get-Item -LiteralPath (Join-Path $bundle $item.installer)
        if ($file.Name -cne "PureTube_$($item.version)_x64-setup.exe" -or $file.VersionInfo.ProductVersion -cne $item.version -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item.sha256 -or (Git-At $source @('rev-parse', $item.tag)).Trim() -cne $item.commit) { throw 'Prepared release does not match its source tag or installer' }
    }
}
Write-Output "Prepared $($plan.Count) versioned releases at $work"
if ($PrepareOnly) { return }

$headers = @{}
$credentialText = $null
$credential = @{}
function Request-GitHub($Method, $Uri, $Body = $null) {
    if (![uri]::IsWellFormedUriString($Uri, [UriKind]::Absolute) -or ([uri]$Uri).Scheme -ne 'https' -or ([uri]$Uri).Host -ne 'api.github.com') { throw 'Unexpected GitHub API destination' }
    if ($null -eq $Body) { return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -TimeoutSec 60 }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 60
}
function Check-Assets($Release, $Item) {
    $expected = @($Item.installer, 'SHA256SUMS.txt')
    if (@($Release.assets).Count -ne 2 -or @($Release.assets | Where-Object { $_.name -notin $expected }).Count) { throw "Unexpected release assets for $($Item.tag)" }
    foreach ($asset in $Release.assets) {
        $path = if ($asset.name -eq $Item.installer) { Join-Path $bundle $Item.installer } else { Join-Path $work "assets/$($Item.tag)/SHA256SUMS.txt" }
        $file = Get-Item -LiteralPath $path
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($asset.state -ne 'uploaded' -or $asset.size -ne $file.Length -or $asset.digest -cne "sha256:$hash") { throw "Uploaded asset verification failed: $($Item.tag)/$($asset.name)" }
    }
}
try {
    $env:GCM_INTERACTIVE = 'Never'
    $credentialText = "protocol=https`nhost=github.com`nusername=$owner`n`n" | & git -c credential.interactive=never credential fill
    if ($LASTEXITCODE -ne 0) { throw 'A GitHub publishing login is required' }
    foreach ($line in $credentialText) { if ($line -match '^([^=]+)=(.*)$') { $credential[$Matches[1]] = $Matches[2] } }
    if (!$credential.password) { throw 'No GitHub publishing credential was available' }
    $headers = @{Authorization="Bearer $($credential.password)";Accept='application/vnd.github+json';'User-Agent'='PureTube-release-publisher';'X-GitHub-Api-Version'='2026-03-10'}
    $identity = Request-GitHub Get 'https://api.github.com/user'
    if ($identity.login -cne $owner -or [string]$identity.id -cne '349487638') { throw 'Publishing stopped: the authenticated GitHub account is not SunshiineDolly' }
    try { $repo = Request-GitHub Get $api }
    catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; $repo = Request-GitHub Post 'https://api.github.com/user/repos' @{name='PureTube';description='A personal, distraction-free YouTube desktop app for Windows';private=$false;auto_init=$false;has_issues=$true;has_wiki=$false} }
    if ($repo.full_name -cne $repository -or !$repo.permissions.push) { throw 'Unexpected repository or missing write access' }
    $remote = "https://$owner@github.com/$repository.git"
    if ('origin' -in @(Git-At $source @('remote'))) { $null = Git-At $source @('remote', 'set-url', 'origin', $remote) }
    else { $null = Git-At $source @('remote', 'add', 'origin', $remote) }
    # Never overwrite an existing repository branch or conflicting version tag.
    $remoteRefs = @(Git-At $source @('ls-remote', 'origin'))
    $expectedRefs = @{ 'refs/heads/main'=(Git-At $source @('rev-parse','main')).Trim() }
    foreach ($item in $plan) { $expectedRefs["refs/tags/$($item.tag)"] = $item.commit }
    foreach ($line in $remoteRefs) {
        $parts = $line -split '\s+', 2
        if ($parts[1] -eq 'HEAD') { continue }
        if (!$expectedRefs.ContainsKey($parts[1]) -or $parts[0] -cne $expectedRefs[$parts[1]]) { throw 'Repository has different Git history. No remote refs were changed.' }
    }
    $null = Git-At $source @('push', '--atomic', 'origin', 'main', '--tags')
    foreach ($item in $plan) {
        $sourceNote = if ($item.source -eq 'retained') {'This tag contains the retained source snapshot for this version.'} else {'Archival installer. The exact application source snapshot for this build was not retained. This tag contains release metadata only; its automatically generated source archive is not application source.'}
        $body = "Windows x64 installer for PureTube $($item.version).`n`n$sourceNote`n`nDownload ``$($item.installer)`` below. SHA-256: ``$($item.sha256)``.`n`nThis installer uses manual upgrades; no signed auto-update feed is configured."
        $existing = @(Request-GitHub Get "$api/releases?per_page=100" | Where-Object { $_.tag_name -ceq $item.tag })
        if ($existing.Count -gt 1) { throw 'Duplicate releases for the same tag' }
        if ($existing.Count) { $release = $existing[0] }
        else { $release = Request-GitHub Post "$api/releases" @{tag_name=$item.tag;target_commitish=$item.commit;name="PureTube $($item.version)";body=$body;draft=$true;prerelease=$false} }
        foreach ($name in @($item.installer, 'SHA256SUMS.txt')) {
            if ($name -in @($release.assets.name)) { continue }
            $path = if ($name -eq $item.installer) { Join-Path $bundle $name } else { Join-Path $work "assets/$($item.tag)/$name" }
            $upload = [uri]($release.upload_url.Split('{')[0])
            if ($upload.Scheme -cne 'https' -or $upload.Host -cne 'uploads.github.com' -or $upload.AbsolutePath -cne "/repos/$repository/releases/$($release.id)/assets") { throw 'Unexpected release upload destination' }
            $null = Invoke-RestMethod -Method Post -Uri ($upload.AbsoluteUri + '?name=' + [uri]::EscapeDataString($name)) -Headers $headers -ContentType 'application/octet-stream' -InFile $path -TimeoutSec 120
        }
        $release = Request-GitHub Get "$api/releases/$($release.id)"
        Check-Assets $release $item
        $null = Request-GitHub Patch "$api/releases/$($release.id)" @{draft=$false;make_latest=$(if ($item.version -eq $latest) {'true'} else {'false'})}
        $published = Request-GitHub Get "$api/releases/tags/$($item.tag)"
        Check-Assets $published $item
        if ($published.draft) { throw 'Release remained a draft' }
        Write-Output "Published and checksum-verified $($published.html_url)"
    }
    $current = Request-GitHub Get "$api/releases/latest"
    if ($current.tag_name -cne "v$latest") { throw 'Latest release does not match the current application version' }
    Write-Output "Verified $($plan.Count) releases. Latest: $($current.html_url)"
}
finally {
    $headers.Clear()
    $credential.Clear()
    $credentialText = $null
    Remove-Item Env:GCM_INTERACTIVE -ErrorAction SilentlyContinue
}
