Get-ChildItem -Path 'c:\Users\ASUS\Desktop\thryftverse\frontend\src' -Recurse -Include '*.tsx','*.ts' | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content

    # Merge duplicate ../theme/designTokens imports on consecutive lines
    $content = $content -replace "import\s*\{\s*([^}]+)\s*\}\s*from\s*['`]\.\./theme/designTokens['`];\r?\nimport\s*\{\s*([^}]+)\s*\}\s*from\s*['`]\.\./theme/designTokens['`];", "import { `$1, `$2 } from '../theme/designTokens';"

    # Merge duplicate ../../theme/designTokens imports on consecutive lines
    $content = $content -replace "import\s*\{\s*([^}]+)\s*\}\s*from\s*['`]\.\./\.\./theme/designTokens['`];\r?\nimport\s*\{\s*([^}]+)\s*\}\s*from\s*['`]\.\./\.\./theme/designTokens['`];", "import { `$1, `$2 } from '../../theme/designTokens';"

    # Merge duplicate ./theme/designTokens imports on consecutive lines (for App.tsx style)
    $content = $content -replace "import\s*\{\s*([^}]+)\s*\}\s*from\s*['`]\.\./theme/designTokens['`];\r?\nimport\s*\{\s*([^}]+)\s*\}\s*from\s*['`]\.\./theme/designTokens['`];", "import { `$1, `$2 } from './theme/designTokens';"

    if ($content -ne $original) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Merged imports: $($_.FullName)"
    }
}
