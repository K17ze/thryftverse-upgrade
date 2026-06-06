$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\SettingsScreenV2.tsx'
$content = Get-Content $file -Raw

# Remove entering props on Reanimated.View lines
$content = $content -replace '\s+entering=\{FadeInDown\.duration\(300\)\.delay\(\d+\)\}', ''

# Also remove the FadeInDown import since it won't be used anymore
$content = $content -replace 'import Reanimated, \{ FadeInDown \} from ''react-native-reanimated'';', ''

Set-Content -Path $file -Value $content -NoNewline
