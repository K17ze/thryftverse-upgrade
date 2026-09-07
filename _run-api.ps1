$ErrorActionPreference = 'Continue'
Set-Location 'c:\Users\User\Desktop\thryftverse-upgrade\backend\api'
$log = 'c:\Users\User\Desktop\thryftverse-upgrade\api.log'
$err = 'c:\Users\User\Desktop\thryftverse-upgrade\api-err.log'
Remove-Item $log, $err -ErrorAction SilentlyContinue
$p = Start-Process -FilePath 'node' -ArgumentList '--enable-source-maps','dist/index.js' `
  -RedirectStandardOutput $log -RedirectStandardError $err -WindowStyle Hidden -PassThru
$ok = $false
for ($i = 0; $i -lt 50; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:4000/health' -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}
Set-Content 'c:\Users\User\Desktop\thryftverse-upgrade\api.done' ("pid=" + $p.Id + " health=" + $ok)
