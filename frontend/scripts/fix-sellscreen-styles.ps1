$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\SellScreenV2.tsx'
$content = Get-Content $file -Raw

# Add solid background to card styles
$patterns = @(
    'mediaEmptyCard: \{',
    'identityCard: \{',
    'pricingCard: \{',
    'detailsCard: \{',
    'deliveryCard: \{',
    'previewCard: \{',
    'floatingCtaGlow: \{'
)

foreach ($pattern in $patterns) {
    $content = $content -replace ($pattern + '\r?\n'), ($pattern + "`r`n    backgroundColor: Colors.surface,`r`n    borderWidth: 1,`r`n    borderColor: Colors.border,`r`n    borderRadius: Radius.lg,`r`n")
}

# mediaEmptyCard already has marginHorizontal, so adjust the regex to insert after first line
$content = $content -replace 'mediaEmptyCard: \{\r?\n    marginHorizontal: 4,', "mediaEmptyCard: {`r`n    marginHorizontal: 4,`r`n    backgroundColor: Colors.surface,`r`n    borderWidth: 1,`r`n    borderColor: Colors.border,`r`n    borderRadius: Radius.lg,"

Set-Content -Path $file -Value $content -NoNewline
