$ErrorActionPreference = 'Continue'
Set-Location 'c:\Users\User\Desktop\thryftverse-upgrade\frontend'
$log = 'c:\Users\User\Desktop\thryftverse-upgrade\metro.log'
$err = 'c:\Users\User\Desktop\thryftverse-upgrade\metro-err.log'
Remove-Item $log, $err -ErrorAction SilentlyContinue
$p = Start-Process -FilePath 'node' -ArgumentList 'node_modules/expo/bin/cli','start','--port','8081' `
  -RedirectStandardOutput $log -RedirectStandardError $err -WindowStyle Hidden -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  $c = netstat -ano | Select-String ':8081.*LISTENING'
  if ($c) { $ok = $true; break }
}
Set-Content 'c:\Users\User\Desktop\thryftverse-upgrade\metro.done' ("pid=" + $p.Id + " listening=" + $ok)
