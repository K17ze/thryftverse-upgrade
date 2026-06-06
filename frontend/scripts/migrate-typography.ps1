Get-ChildItem -Path 'c:\Users\ASUS\Desktop\thryftverse\frontend\src' -Recurse -Include '*.tsx','*.ts' | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content

    # Typography imports at various depths
    $content = $content -replace "import\s*{\s*Typography\s*}\s*from\s*['`]\.\./constants/typography['`];", "import { Typography } from '../theme/designTokens';"
    $content = $content -replace "import\s*{\s*Typography\s*}\s*from\s*['`]\.\./\.\./constants/typography['`];", "import { Typography } from '../../theme/designTokens';"
    $content = $content -replace "import\s*{\s*Typography\s*}\s*from\s*['`]\.\./\.\./\.\./constants/typography['`];", "import { Typography } from '../../../theme/designTokens';"

    # TypeStyles imports at various depths
    $content = $content -replace "import\s*{\s*TypeStyles\s*}\s*from\s*['`]\.\./constants/typography['`];", "import { TypeStyles } from '../theme/designTokens';"
    $content = $content -replace "import\s*{\s*TypeStyles\s*}\s*from\s*['`]\.\./\.\./constants/typography['`];", "import { TypeStyles } from '../../theme/designTokens';"

    # Remove duplicate designTokens imports by merging them
    # This is a simple heuristic: if both Typography and something else are imported from designTokens on separate lines, merge them

    if ($content -ne $original) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Updated: $($_.FullName)"
    }
}
