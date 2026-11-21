. (Join-Path $PSScriptRoot 'Release-Platforms.ps1')
function New-Manifest {
 return ('{"platforms":{"windows-x86_64":{"url":"windows","signature":"test"},"darwin-aarch64":{"url":"mac","signature":"test"},"darwin-x86_64":{"url":"mac","signature":"test"}}}' | ConvertFrom-Json)
}
function Must-Reject($Manifest) {
 $rejected=$false
 try { Assert-ReleasePlatforms -Manifest $Manifest } catch { $rejected=$true }
 if (!$rejected) { throw 'An incomplete release was accepted' }
}
Assert-ReleasePlatforms -Manifest (New-Manifest)
$manifest=New-Manifest
$manifest.platforms.PSObject.Properties.Remove('darwin-aarch64')
$manifest.platforms.PSObject.Properties.Remove('darwin-x86_64')
Must-Reject $manifest
$manifest=New-Manifest
$manifest.platforms.PSObject.Properties.Remove('darwin-x86_64')
Must-Reject $manifest
$manifest=New-Manifest
$manifest.platforms.'darwin-aarch64'.signature=''
Must-Reject $manifest
Write-Output 'Passed: complete releases accepted; Windows-only, missing Intel Mac and unsigned Mac releases rejected.'
