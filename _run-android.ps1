$ErrorActionPreference = 'Continue'
$adb = 'C:\Users\User\AppData\Local\Android\Sdk\platform-tools\adb.exe'
Set-Location 'c:\Users\User\Desktop\thryftverse-upgrade\frontend\android'
$log = 'c:\Users\User\Desktop\thryftverse-upgrade\android-build.log'
$err = 'c:\Users\User\Desktop\thryftverse-upgrade\android-build-err.log'
Remove-Item $log, $err -ErrorAction SilentlyContinue
$p = Start-Process -FilePath '.\gradlew.bat' -ArgumentList ':app:assembleDebug','--console=plain','--no-daemon' `
  -RedirectStandardOutput $log -RedirectStandardError $err -WindowStyle Hidden -PassThru
$p.WaitForExit()
$apk = Get-ChildItem 'app\build\outputs\apk\debug' -Filter '*.apk' -ErrorAction SilentlyContinue | Select-Object -First 1
$installed = $false
$launched = $false
if ($apk) {
  $installOut = & $adb -s emulator-5554 install -r $apk.FullName 2>&1 | Out-String
  if ($installOut -match 'Success') { $installed = $true }
  if ($installed) {
    $launchOut = & $adb -s emulator-5554 shell am start -n com.thryftverse.app/.MainActivity 2>&1 | Out-String
    $launched = $true
  }
}
Set-Content 'c:\Users\User\Desktop\thryftverse-upgrade\android.done' ("exit=" + $p.ExitCode + " apk=" + ($null -ne $apk) + " installed=" + $installed + " launched=" + $launched)
