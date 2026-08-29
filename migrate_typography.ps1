# Typography migration script
# Migrates Type.XXX tokens to TypographyV2.YYY roles

$map = @{
    'display' = 'display'
    'title' = 'screenTitle'
    'screenTitle' = 'screenTitle'
    'subtitle' = 'sectionTitle'
    'sectionTitle' = 'sectionTitle'
    'itemTitle' = 'itemTitle'
    'body' = 'body'
    'bodyEmphasis' = 'bodyStrong'
    'bodyStrong' = 'bodyStrong'
    'bodyLarge' = 'priceList'
    'price' = 'priceList'
    'priceList' = 'priceList'
    'priceLarge' = 'priceHero'
    'priceHero' = 'priceHero'
    'caption' = 'meta'
    'captionElevated' = 'meta'
    'meta' = 'meta'
    'metaElevated' = 'label'
    'label' = 'label'
    'numericMeta' = 'numericMeta'
}

function Migrate-File {
    param([string]$FilePath)

    $content = Get-Content $FilePath -Raw
    $changed = $false

    # Step 1: Replace Type.XXX.prop with TypographyV2.ZZZ.prop
    foreach ($key in $map.Keys) {
        $v2Role = $map[$key]
        $pattern = "Type\.$key\."
        $replacement = "TypographyV2.$v2Role."
        if ($content -match $pattern) {
            $content = $content -replace $pattern, $replacement
            $changed = $true
        }
    }

    # Step 2: Replace Typography.family.X with TypographyV2.ZZZ.fontFamily based on context
    # Process line by line, tracking the current role from fontSize lines
    $lines = $content -split "`r?`n"
    $currentRole = $null
    $fontFamilyReplaced = $false
    for ($i = 0; $i -lt $lines.Length; $i++) {
        # Track current role from fontSize: TypographyV2.ZZZ.size lines
        if ($lines[$i] -match 'fontSize:\s*TypographyV2\.(\w+)\.size') {
            $currentRole = $matches[1]
        }
        # Also track from fontSize: TypographyV2.ZZZ.size, but only if not a ternary
        # Replace fontFamily: Typography.family.X (but NOT ternary expressions with ?)
        if ($lines[$i] -match 'fontFamily:\s*Typography\.family\.(\w+)' -and $lines[$i] -notmatch '\?') {
            if ($currentRole) {
                $lines[$i] = $lines[$i] -replace 'Typography\.family\.\w+', "TypographyV2.$currentRole.fontFamily"
                $fontFamilyReplaced = $true
                $changed = $true
            }
        }
        # Reset currentRole at the end of a style block (closing brace)
        if ($lines[$i] -match '^\s*\},?\s*$' -or $lines[$i] -match '^\s*\},?\s*//') {
            $currentRole = $null
        }
    }
    $content = $lines -join "`r`n"

    if (-not $changed) {
        Write-Host "  No changes needed in $FilePath"
        return
    }

    # Step 3: Add TypographyV2 import if not present
    if ($content -notmatch 'import.*TypographyV2.*from') {
        # Determine relative path depth
        $relativePath = $FilePath -replace '.*\\src\\', ''
        $depth = ($relativePath -split '\\').Count - 1
        $importPath = '../' * $depth + 'theme/typography.v2'
        $v2Import = "import { TypographyV2 } from '$importPath';"

        # Add after the designTokens import line
        if ($content -match "(import \{[^}]*\} from '[^']*designTokens';)") {
            $content = $content -replace "(import \{[^}]*\} from '[^']*designTokens';)", "`$1`r`n$v2Import"
        }
    }

    # Step 4: Remove Type from designTokens import
    $content = $content -replace '(import \{[^}]*)\s*,\s*Type(\s*,)', '`$1,'
    $content = $content -replace '(import \{[^}]*)\s*,\s*Type(\s*\})', '`$1`$2'
    $content = $content -replace '(import \{[^}]*)\bType\s*,\s*', '`$1'
    $content = $content -replace '(import \{[^}]*)\bType\b(\s*\})', '`$1`$2'

    # Step 5: Check if Typography.family is still used
    $typographyFamilyRemaining = $content -match 'Typography\.family\.'
    if (-not $typographyFamilyRemaining) {
        # Remove Typography from designTokens import
        $content = $content -replace '(import \{[^}]*)\s*,\s*Typography(\s*,)', '`$1,'
        $content = $content -replace '(import \{[^}]*)\s*,\s*Typography(\s*\})', '`$1`$2'
        $content = $content -replace '(import \{[^}]*)\bTypography\s*,\s*', '`$1'
        $content = $content -replace '(import \{[^}]*)\bTypography\b(\s*\})', '`$1`$2'
    }

    # Clean up any double spaces left in imports
    $content = $content -replace 'import \{\s+,', 'import {'
    $content = $content -replace ',\s+,', ','
    $content = $content -replace '\{\s+\}', '{}'

    Set-Content $FilePath -Value $content -NoNewline
    Write-Host "  Migrated $FilePath"
}

$files = @(
    'frontend\src\screens\AssetLeaderboardScreen.tsx',
    'frontend\src\screens\CoOwnIssueScreen.tsx',
    'frontend\src\screens\CoOwnPriceAlertsScreen.tsx',
    'frontend\src\screens\CoOwnRecurringOrdersScreen.tsx',
    'frontend\src\screens\CoOwnTaxDocumentsScreen.tsx',
    'frontend\src\screens\CreateSyndicateScreen.tsx',
    'frontend\src\screens\MarketLedgerScreen.tsx',
    'frontend\src\screens\SyndicateHubScreen.tsx',
    'frontend\src\screens\SyndicateOnboardingScreen.tsx',
    'frontend\src\screens\SyndicateOrderHistoryScreen.tsx'
)

foreach ($f in $files) {
    $fullPath = Join-Path "C:\Users\User\Desktop\thryftverse-upgrade" $f
    Write-Host "Processing $f..."
    Migrate-File -FilePath $fullPath
}

Write-Host "Done!"
