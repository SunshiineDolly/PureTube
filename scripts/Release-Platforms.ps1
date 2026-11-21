function Assert-ReleasePlatforms {
 param([Parameter(Mandatory)]$Manifest)
 $expected=@('windows-x86_64','darwin-aarch64','darwin-x86_64')
 $actual=@($Manifest.platforms.PSObject.Properties.Name)
 if ($actual.Count -ne $expected.Count -or @($expected | Where-Object { $_ -cnotin $actual }).Count) {
  throw 'Every Viddy update must include Windows, Apple Silicon Mac, and Intel Mac. Build and sign all platforms before publishing.'
 }
 foreach ($platform in $expected) {
  $entry=$Manifest.platforms.$platform
  if (!$entry.signature -or !$entry.url) { throw "Missing signed update for $platform" }
 }
}
