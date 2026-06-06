cd 'c:\Users\ASUS\Desktop\thryftverse\frontend\src'

Write-Host "=== STATIC THEME DEBT (priority files) ===" -ForegroundColor Cyan
$files = @('screens\InboxScreen.tsx','screens\ChatScreen.tsx','screens\SettingsScreenV2.tsx','screens\HomeScreen.tsx','screens\BrowseScreen.tsx','screens\ItemDetailScreen.tsx','screens\CreatePosterScreenV2.tsx')
foreach ($f in $files) {
  $r = Select-String -Path $f -Pattern 'ActiveTheme|IS_LIGHT|Colors\.background\s*===\s*''#FFFFFF''' -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
  else { Write-Host "$f clean" }
}

Write-Host ""
Write-Host "=== GOLD/YELLOW (priority files + components) ===" -ForegroundColor Cyan
$pattern = '#c9a86c|#D4AF37|#d7b98f|#FFD700|#FFA500|variant="gold"'
$allFiles = $files + @('components\chat\ChatTopBar.tsx','components\chat\ChatComposerBar.tsx','components\chat\ChatBubbleV2.tsx','components\chat\MarketplaceChatCard.tsx','components\chat\ChatActionSheet.tsx','components\settings\SettingsPage.tsx','components\settings\SettingsSection.tsx','components\settings\SettingsRow.tsx')
foreach ($f in $allFiles) {
  $r = Select-String -Path $f -Pattern $pattern -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== ANIMATION DEBT (priority files + components) ===" -ForegroundColor Cyan
$animPattern = 'FadeInDown|FadeInUp|SlideInRight|SlideInLeft|ZoomIn|springify'
foreach ($f in $allFiles) {
  $r = Select-String -Path $f -Pattern $animPattern -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== entering=/exiting= (priority files + components) ===" -ForegroundColor Cyan
foreach ($f in $allFiles) {
  $r = Select-String -Path $f -Pattern 'entering=|exiting=' -SimpleMatch
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
