cd 'c:\Users\ASUS\Desktop\thryftverse\frontend\src'

$msgFiles = @(
  'screens\InboxScreen.tsx',
  'screens\ChatScreen.tsx',
  'screens\CreateGroupChatScreen.tsx',
  'screens\ChatSettingsScreenV2.tsx',
  'screens\BotDirectoryScreen.tsx',
  'screens\GroupBotDirectoryScreen.tsx',
  'components\chat\ChatTopBar.tsx',
  'components\chat\ChatComposerBar.tsx',
  'components\chat\ChatBubbleV2.tsx',
  'components\chat\MarketplaceChatCard.tsx',
  'components\chat\ChatActionSheet.tsx',
  'components\chat\MessageContextMenu.tsx',
  'components\chat\EmojiReactionsBar.tsx',
  'components\chat\ScrollToBottomFAB.tsx',
  'components\chat\LinkPreviewCard.tsx',
  'components\chat\SkeletonChatLoader.tsx'
)

Write-Host "=== STATIC THEME DEBT ===" -ForegroundColor Cyan
foreach ($f in $msgFiles) {
  $r = Select-String -Path $f -Pattern 'ActiveTheme|IS_LIGHT' -SimpleMatch
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== GOLD/YELLOW ===" -ForegroundColor Cyan
$goldPattern = '#c9a86c|#D4AF37|#d7b98f|#FFD700|#FFA500|#F59E0B|variant="gold"'
foreach ($f in $msgFiles) {
  $r = Select-String -Path $f -Pattern $goldPattern -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== ANIMATION DEBT ===" -ForegroundColor Cyan
$animPattern = 'FadeInDown|FadeInUp|SlideInRight|SlideInLeft|ZoomIn|springify'
foreach ($f in $msgFiles) {
  $r = Select-String -Path $f -Pattern $animPattern -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== entering=/exiting= ===" -ForegroundColor Cyan
foreach ($f in $msgFiles) {
  $r = Select-String -Path $f -Pattern 'entering=|exiting=' -SimpleMatch
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== GLASS SURFACES ===" -ForegroundColor Cyan
foreach ($f in $msgFiles) {
  $r = Select-String -Path $f -Pattern 'BlurView|GlassCard|GlowSurface' -SimpleMatch
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== PRODUCT TRUTH ===" -ForegroundColor Cyan
$truthPattern = 'picsum.photos|isOnline|coming soon|not connected yet|fake success|no-op|MOCK_USERS'
foreach ($f in $msgFiles) {
  $r = Select-String -Path $f -Pattern $truthPattern -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "=== DEAD BUTTONS (empty onPress) ===" -ForegroundColor Cyan
foreach ($f in $msgFiles) {
  $r = Select-String -Path $f -Pattern 'onPress=\{\(\) => \{\}\}' -CaseSensitive
  if ($r) { Write-Host "$f HAS HITS:"; $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" } }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
