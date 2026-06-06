$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\ChatSettingsScreenV2.tsx'
$content = Get-Content $file -Raw

# Replace all Reanimated.View opening tags with View
$content = $content -replace '<Reanimated\.View entering=\{FadeInDown\.duration\(300\)\.delay\(\d+\)\}>', '<View>'

# Replace all closing Reanimated.View tags
$content = $content -replace '</Reanimated\.View>', '</View>'

Set-Content -Path $file -Value $content -NoNewline
