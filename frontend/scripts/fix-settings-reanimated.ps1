$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\SettingsScreenV2.tsx'
$content = Get-Content $file -Raw

# Replace all Reanimated.View with View
$content = $content -replace '<Reanimated\.View', '<View'
$content = $content -replace '</Reanimated\.View>', '</View>'

Set-Content -Path $file -Value $content -NoNewline
