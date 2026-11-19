[CmdletBinding()]
param(
 [string]$PublicKeyPath=(Join-Path $PSScriptRoot '..\src-tauri\updater-public-key.pub'),
 [string]$PrivateKeyPath=(Join-Path $env:LOCALAPPDATA 'PureTube\signing\updater.key'),
 [string]$PasswordFile=(Join-Path $env:LOCALAPPDATA 'PureTube\signing\password.dpapi'),
 [string]$NotesPath,
 [switch]$BundleOnly,
 [uri]$FeedUrl='https://github.com/SunshiineDolly/PureTube/releases/latest/download/latest.json',
 [uri]$AssetBaseUrl
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pubFile=(Resolve-Path -LiteralPath $PublicKeyPath).Path
$secretFile=(Resolve-Path -LiteralPath $PrivateKeyPath).Path
if($pubFile -eq $secretFile -or $secretFile.StartsWith($repo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
 throw 'Keep the private signing key outside the repository and pass the separate public key file.'
}
$config=Get-Content -LiteralPath (Join-Path $repo 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$version=$config.version
if(!$NotesPath){$NotesPath=Join-Path $repo "releases/v$version.md"}
$notes=if(Test-Path -LiteralPath $NotesPath){Get-Content -LiteralPath $NotesPath -Raw}else{"PureTube $version update."}
if(!$AssetBaseUrl){$AssetBaseUrl=[uri]"https://github.com/SunshiineDolly/PureTube/releases/download/v$version/"}
foreach($url in @($FeedUrl,$AssetBaseUrl)){
 if(!$url.IsAbsoluteUri -or $url.Scheme -ne 'https' -or $url.UserInfo -or $url.Fragment -or $url.Query){throw 'Use public HTTPS URLs without embedded credentials, query parameters, or fragments.'}
}
if(!$AssetBaseUrl.AbsoluteUri.EndsWith('/')){throw 'AssetBaseUrl must end in a slash.'}
$pub=(Get-Content -LiteralPath $pubFile -Raw).Trim()
if(!$pub){throw 'The public key file is empty.'}
$override=Join-Path ([IO.Path]::GetTempPath()) ('puretube-updater-'+[Guid]::NewGuid().ToString('N')+'.json')
$pass=if(Test-Path -LiteralPath $PasswordFile){Get-Content -LiteralPath $PasswordFile -Raw | ConvertTo-SecureString}else{Read-Host 'Tauri signing key password (input stays hidden)' -AsSecureString}
$names=@('PURETUBE_UPDATER_PUBLIC_KEY','PURETUBE_UPDATER_ENDPOINT','TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
$previous=@{}
foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
Push-Location -LiteralPath $repo
try {
 $env:PURETUBE_UPDATER_PUBLIC_KEY=$pub
 $env:PURETUBE_UPDATER_ENDPOINT=$FeedUrl.AbsoluteUri
 $env:TAURI_SIGNING_PRIVATE_KEY=$secretFile
 $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=[System.Net.NetworkCredential]::new('',$pass).Password
 $json=@{bundle=@{createUpdaterArtifacts=$true};plugins=@{updater=@{pubkey=$pub;endpoints=@($FeedUrl.AbsoluteUri);requireSignedVersion=$true}}} | ConvertTo-Json -Depth 6
 [IO.File]::WriteAllText($override,$json)
 if($BundleOnly){
  $binary=Get-Item -LiteralPath (Join-Path $repo 'src-tauri/target/release/puretube.exe')
  if($binary.VersionInfo.ProductVersion -ne $version){throw 'Build the matching application before bundling it.'}
  npm.cmd run tauri bundle -- --ci --config $override
 } else {
  npm.cmd run tauri build -- --ci --config $override
 }
 if($LASTEXITCODE){throw 'Signed Windows build failed.'}
 $output=Join-Path $repo 'src-tauri/target/release/bundle/nsis'
 $name="$($config.productName)_${version}_x64-setup.exe"
 $installer=Get-Item -LiteralPath (Join-Path $output $name)
 if($installer.VersionInfo.ProductVersion -ne $version){throw 'Installer version does not match the source version.'}
 $signature=(Get-Content -LiteralPath ($installer.FullName+'.sig') -Raw).Trim()
 if(!$signature){throw 'Tauri did not generate an installer signature.'}
 $manifest=@{version=$version;notes=$notes;pub_date=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ');platforms=@{'windows-x86_64'=@{url=[uri]::new($AssetBaseUrl,$name).AbsoluteUri;signature=$signature}}}
 $destination=Join-Path $output 'latest.json'
 [IO.File]::WriteAllText($destination,($manifest | ConvertTo-Json -Depth 6)+[Environment]::NewLine)
 Get-Item -LiteralPath $installer.FullName,($installer.FullName+'.sig'),$destination | Select-Object Name,Length,FullName
} finally {
 Pop-Location
 foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}
 $pass.Dispose()
 Remove-Item -LiteralPath $override -ErrorAction SilentlyContinue
}
