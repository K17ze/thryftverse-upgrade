cd 'c:\Users\ASUS\Desktop\thryftverse\frontend\src'

Write-Host "=== STATIC THEME DEBT ===" -ForegroundColor Cyan
$files = @('screens\InboxScreen.tsx','screens\ChatScreen.tsx','screens\SettingsScreenV2.tsx','screens\HomeScreen.tsx','screens\BrowseScreen.tsx','screens\ItemDetailScreen.tsx','screens\CreatePosterScreenV2.tsx')
foreach ($f in $files) {
  $r = Select-String -Path $f -Pattern 'ActiveTheme|IS_LIGHT' -SimpleMatch
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}
Write-Host ""

Write-Host "=== GOLD/YELLOW ===" -ForegroundColor Cyan
$pattern = '#c9a86c|#D4AF37|#d7b98f|#FFD700|#FFA500|gold|yellow|amber|variant="gold"'
foreach ($f in $files) {
  $r = Select-String -Path $f -Pattern $pattern -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}
# Also check chat and settings components
$compFiles = @('components\chat\ChatTopBar.tsx','components\chat\ChatComposerBar.tsx','components\chat\ChatBubbleV2.tsx','components\chat\MarketplaceChatCard.tsx','components\chat\ChatActionSheet.tsx','components\settings\SettingsPage.tsx','components\settings\SettingsSection.tsx','components\settings\SettingsRow.tsx')
foreach ($f in $compFiles) {
  $r = Select-String -Path $f -Pattern $pattern -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}
Write-Host ""

Write-Host "=== ANIMATION DEBT ===" -ForegroundColor Cyan
$animPattern = 'FadeInDown|FadeInUp|SlideInRight|SlideInLeft|ZoomIn|springify'
foreach ($f in $files) {
  $r = Select-String -Path $f -Pattern $animPattern -SimpleMatch
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}
foreach ($f in $compFiles) {
  $r = Select-String -Path $f -Pattern $animPattern -SimpleMatch
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}
Write-Host ""
Write-Host "Done." -ForegroundColor Green
