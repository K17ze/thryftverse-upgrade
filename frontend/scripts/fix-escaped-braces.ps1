$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\SellScreenV2.tsx'
$content = Get-Content $file -Raw

# Fix all literal backslash-brace sequences introduced by the bad regex
$content = $content -replace ':\s*\\\{', ': {'

Set-Content -Path $file -Value $content -NoNewline
