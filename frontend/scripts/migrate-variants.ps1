Get-ChildItem -Path 'c:\Users\ASUS\Desktop\thryftverse\frontend\src' -Recurse -Include '*.tsx','*.ts' | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content

    $content = $content -replace 'variant="gold"', 'variant="primary"'
    $content = $content -replace "variant='gold'", 'variant="primary"'
    $content = $content -replace 'variant="contrast"', 'variant="primary"'
    $content = $content -replace "variant='contrast'", 'variant="primary"'

    if ($content -ne $original) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Updated variants: $($_.FullName)"
    }
}
